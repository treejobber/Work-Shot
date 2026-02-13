/**
 * Smart crop — use Gemini vision to find optimal crop regions for
 * before/after images at a target panel aspect ratio.
 *
 * Falls back to center-crop when:
 * - GEMINI_API_KEY is not set
 * - @google/genai is not installed
 * - Gemini call fails, times out, or returns invalid data
 *
 * Prompt follows docs/GEMINI_PROMPTING_PATTERNS.md:
 *   1. State what you have (exact dimensions)
 *   2. State what stays fixed (target panel size)
 *   3. Numbered rules
 *   4. Anchor point (main subject)
 *   5. Exact JSON output format
 *   6. Boundary math
 *   7. Reasoning field
 */

import * as fs from "fs";
import sharp from "sharp";

/** Crop region returned by smart-crop analysis. */
export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Result from smart-crop: crop regions for both images. */
export interface SmartCropResult {
  before: CropRegion;
  after: CropRegion;
  reasoning: string;
}

/** Max edge size for images sent to Gemini (controls memory + latency). */
const MAX_ANALYSIS_EDGE = 1600;

/** Gemini call timeout in milliseconds. */
const GEMINI_TIMEOUT_MS = 8000;

/**
 * Attempt smart-crop via Gemini vision analysis.
 *
 * Returns crop regions for both images that keep the main subject
 * visible and centered at the target panel aspect ratio, or null
 * if smart-crop is unavailable/fails (caller should use center-crop).
 */
export async function getSmartCrop(
  beforePath: string,
  afterPath: string,
  panelWidth: number,
  panelHeight: number
): Promise<SmartCropResult | null> {
  // Check API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  // Dynamic import — graceful failure if package not installed
  let GoogleGenAI: any;
  try {
    const mod = await import("@google/genai");
    GoogleGenAI = mod.GoogleGenAI;
  } catch {
    console.warn("[smart-crop] @google/genai not available, using center-crop fallback");
    return null;
  }

  try {
    // Read image metadata for dimensions
    const beforeMeta = await sharp(beforePath).metadata();
    const afterMeta = await sharp(afterPath).metadata();

    const bw = beforeMeta.width!;
    const bh = beforeMeta.height!;
    const aw = afterMeta.width!;
    const ah = afterMeta.height!;

    // Verify images are large enough to crop to panel size
    if (bw < panelWidth || bh < panelHeight || aw < panelWidth || ah < panelHeight) {
      console.warn("[smart-crop] Image(s) smaller than panel — using center-crop fallback");
      return null;
    }

    // Downscale images for Gemini analysis (cap memory, reduce latency)
    const beforeAnalysis = await downscaleForAnalysis(beforePath);
    const afterAnalysis = await downscaleForAnalysis(afterPath);

    const prompt = buildPrompt(bw, bh, aw, ah, panelWidth, panelHeight);

    const ai = new GoogleGenAI({ apiKey });

    // Call Gemini with timeout
    const response = await withTimeout(
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: beforeAnalysis.base64,
                },
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: afterAnalysis.base64,
                },
              },
              { text: prompt },
            ],
          },
        ],
      }),
      GEMINI_TIMEOUT_MS
    );

    const text = (response as any).text || "";

    // Parse and validate
    const result = parseAndValidate(text, bw, bh, aw, ah, panelWidth, panelHeight);
    if (!result) {
      console.warn("[smart-crop] Invalid Gemini response — using center-crop fallback");
      return null;
    }

    console.log(`[smart-crop] Gemini crop: before(${result.before.left},${result.before.top}) after(${result.after.left},${result.after.top}) — ${result.reasoning}`);
    return result;
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[smart-crop] Failed: ${msg} — using center-crop fallback`);
    return null;
  }
}

/**
 * Downscale an image to fit within MAX_ANALYSIS_EDGE on its longest edge,
 * return as JPEG base64 for Gemini.
 */
async function downscaleForAnalysis(
  imagePath: string
): Promise<{ base64: string }> {
  const buffer = await sharp(imagePath)
    .resize(MAX_ANALYSIS_EDGE, MAX_ANALYSIS_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { base64: buffer.toString("base64") };
}

/**
 * Build the Gemini prompt for panel-crop analysis.
 *
 * Unlike the crossfade script (which crops one image to match the other's
 * dimensions), this prompt asks Gemini to find the best crop region in
 * EACH image to fit a specific panel aspect ratio while keeping the
 * main subject (tree/work area) visible and well-positioned.
 */
function buildPrompt(
  bw: number,
  bh: number,
  aw: number,
  ah: number,
  pw: number,
  ph: number
): string {
  return `I have two photos of the same tree service job — a "before" photo (image 1, ${bw}x${bh} pixels) and an "after" photo (image 2, ${aw}x${ah} pixels).

I need to crop EACH image to exactly ${pw}x${ph} pixels for a side-by-side social media composite. I want the main subject (the tree or work area) to be well-framed and visible in both crops.

Rules:
1. Each crop must be EXACTLY ${pw}x${ph} pixels
2. The main subject (tree, stump, or work area) must be fully visible in both crops — do not clip the subject
3. Position each crop so the main subject is centered or slightly offset for visual balance
4. If the tree/subject is tall and narrow, prefer a crop that captures the full height
5. Fixed landmarks (houses, fences, driveways) should be in similar positions in both crops when possible
6. Each crop rectangle must stay within its source image boundaries

Before image (image 1) dimensions: ${bw}x${bh}
After image (image 2) dimensions: ${aw}x${ah}
Target crop size: ${pw}x${ph}

Boundary constraints:
- Before crop: left >= 0, top >= 0, left + ${pw} <= ${bw}, top + ${ph} <= ${bh}
- After crop: left >= 0, top >= 0, left + ${pw} <= ${aw}, top + ${ph} <= ${ah}

Return ONLY valid JSON in this exact format, no other text:
{
  "before": { "left": 0, "top": 0, "width": ${pw}, "height": ${ph} },
  "after": { "left": 0, "top": 0, "width": ${pw}, "height": ${ph} },
  "reasoning": "brief explanation of subject position and crop choice"
}

Values must be non-negative integers. Width must be exactly ${pw} and height must be exactly ${ph} for both crops.`;
}

/**
 * Parse Gemini response text and validate crop regions.
 * Returns null if parsing or validation fails.
 */
export function parseAndValidate(
  text: string,
  bw: number,
  bh: number,
  aw: number,
  ah: number,
  pw: number,
  ph: number
): SmartCropResult | null {
  // Extract JSON from response (may have markdown fences or prose)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  // Validate structure
  if (!parsed.before || !parsed.after) return null;

  const bc = parsed.before;
  const ac = parsed.after;

  // Validate all fields are non-negative integers
  for (const crop of [bc, ac]) {
    for (const key of ["left", "top", "width", "height"]) {
      const val = crop[key];
      if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
        return null;
      }
    }
  }

  // Validate exact target dimensions
  if (bc.width !== pw || bc.height !== ph) return null;
  if (ac.width !== pw || ac.height !== ph) return null;

  // Validate in-bounds
  if (bc.left + bc.width > bw || bc.top + bc.height > bh) return null;
  if (ac.left + ac.width > aw || ac.top + ac.height > ah) return null;

  return {
    before: { left: bc.left, top: bc.top, width: bc.width, height: bc.height },
    after: { left: ac.left, top: ac.top, width: ac.width, height: ac.height },
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

/**
 * Race a promise against a timeout. Rejects with an error on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
