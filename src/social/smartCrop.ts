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

/** Pixel coordinate (anchor point detected by Gemini). */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Result from smart-crop: crop regions for both images. */
export interface SmartCropResult {
  before: CropRegion;
  after: CropRegion;
  /** Trunk-base anchor in the before source image (optional, for debugging). */
  beforeTrunkBase?: PixelPoint;
  /** Trunk-base anchor in the after source image (optional, for debugging). */
  afterTrunkBase?: PixelPoint;
  reasoning: string;
}

/** Max edge size for images sent to Gemini (controls memory + latency). */
const MAX_ANALYSIS_EDGE = 1600;

/** Gemini call timeout in milliseconds. */
const GEMINI_TIMEOUT_MS = 25000;

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

    const trunkInfo = result.beforeTrunkBase && result.afterTrunkBase
      ? ` trunk-base: before(${result.beforeTrunkBase.x},${result.beforeTrunkBase.y}) after(${result.afterTrunkBase.x},${result.afterTrunkBase.y})`
      : "";
    console.log(`[smart-crop] Gemini crop: before(${result.before.left},${result.before.top}) after(${result.after.left},${result.after.top})${trunkInfo} — ${result.reasoning}`);
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
 * Build the Gemini prompt for social panel-crop analysis.
 *
 * Uses trunk-base anchoring: Gemini identifies the tree trunk base in both
 * images and positions crop rectangles so trunk base lands at the same
 * relative (x%, y%) position in each panel. This keeps the tree aligned
 * across both panels of the composite.
 *
 * Both images are cropped to exactly pw x ph (unlike the crossfade script
 * which only crops the before image to match the after's dimensions).
 *
 * Follows docs/GEMINI_PROMPTING_PATTERNS.md.
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

I need to crop EACH image to exactly ${pw}x${ph} pixels for a side-by-side social media composite. The work area must be aligned between both panels so the before/after comparison is visually clear.

Step 1: Identify the primary anchor point in BOTH images. If a tree is visible, use the tree trunk base (where the trunk meets the ground). If no tree is visible (e.g., stump removal, landscaping, cleanup), use the most prominent fixed feature in the work area (e.g., stump center, fence post, driveway edge). Record the pixel coordinates of this anchor in each source image.

Step 2: Position each crop rectangle so the anchor lands at the SAME relative position (x%, y%) within each ${pw}x${ph} panel. This ensures the work area appears at the same spot in both panels.

Rules:
1. Each crop must be EXACTLY ${pw}x${ph} pixels
2. The primary subject (tree, stump, or work area) must be fully visible in both crops. For trees: show from trunk base to canopy top. Do not clip the subject
3. If the full subject cannot fit within ${pw}x${ph}, maximize visibility: prioritize showing the anchor point and as much of the subject as possible, and explain the compromise in your reasoning
4. The anchor point must be at the same relative (x%, y%) position in both crop rectangles
5. The anchor point must be INSIDE its crop rectangle (not outside it)
6. Fixed landmarks (house roofline, fences, driveways, other trees) should align as closely as possible between the two crops
7. Each crop rectangle must stay within its source image boundaries

Before image (image 1) dimensions: ${bw}x${bh}
After image (image 2) dimensions: ${aw}x${ah}
Target crop size: ${pw}x${ph}

Boundary constraints:
- Before crop: left >= 0, top >= 0, left + ${pw} <= ${bw}, top + ${ph} <= ${bh}
- After crop: left >= 0, top >= 0, left + ${pw} <= ${aw}, top + ${ph} <= ${ah}
- Before anchor must be inside before crop: before_trunk_base.x >= before.left AND before_trunk_base.x < before.left + ${pw} AND before_trunk_base.y >= before.top AND before_trunk_base.y < before.top + ${ph}
- After anchor must be inside after crop: same logic for after_trunk_base and after crop

Return ONLY valid JSON in this exact format, no other text:
{
  "before_trunk_base": { "x": 0, "y": 0 },
  "after_trunk_base": { "x": 0, "y": 0 },
  "before": { "left": 0, "top": 0, "width": ${pw}, "height": ${ph} },
  "after": { "left": 0, "top": 0, "width": ${pw}, "height": ${ph} },
  "reasoning": "brief explanation of anchor choice, position, and crop alignment"
}

Values must be non-negative integers. Width must be exactly ${pw} and height must be exactly ${ph} for both crops. Anchor coordinates must be within the source image AND inside the returned crop rectangle.`;
}

/**
 * Validate a PixelPoint: non-negative integer coordinates within bounds.
 * Returns validated point or null if invalid.
 */
function validatePixelPoint(
  point: any,
  maxX: number,
  maxY: number
): PixelPoint | null {
  if (!point || typeof point !== "object") return null;
  const { x, y } = point;
  if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x >= maxX) return null;
  if (typeof y !== "number" || !Number.isInteger(y) || y < 0 || y >= maxY) return null;
  return { x, y };
}

/**
 * Check whether a pixel point falls inside a crop rectangle.
 * Uses exclusive upper bounds (point at left+width or top+height is outside).
 */
function isPointInsideCrop(point: PixelPoint, crop: { left: number; top: number; width: number; height: number }): boolean {
  return (
    point.x >= crop.left &&
    point.x < crop.left + crop.width &&
    point.y >= crop.top &&
    point.y < crop.top + crop.height
  );
}

/**
 * Parse Gemini response text and validate crop regions.
 * Returns null if parsing or validation fails.
 *
 * Trunk-base fields (before_trunk_base, after_trunk_base) are optional:
 * - If present and valid (integer, in source bounds, inside crop rect),
 *   included in result for debugging/logging.
 * - If present but malformed (wrong type, out of bounds, outside crop),
 *   entire result is rejected (Gemini produced inconsistent output).
 * - If absent, result is accepted without them (backward-compatible).
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

  // Validate trunk-base fields (optional but must be valid if present).
  // Two checks: (1) within source image bounds, (2) within crop rectangle.
  // An anchor outside the crop means Gemini's alignment is wrong.
  let beforeTrunkBase: PixelPoint | undefined;
  let afterTrunkBase: PixelPoint | undefined;

  if (parsed.before_trunk_base !== undefined) {
    const validated = validatePixelPoint(parsed.before_trunk_base, bw, bh);
    if (!validated) return null; // Present but malformed → reject
    if (!isPointInsideCrop(validated, bc)) return null; // Anchor outside crop → reject
    beforeTrunkBase = validated;
  }

  if (parsed.after_trunk_base !== undefined) {
    const validated = validatePixelPoint(parsed.after_trunk_base, aw, ah);
    if (!validated) return null; // Present but malformed → reject
    if (!isPointInsideCrop(validated, ac)) return null; // Anchor outside crop → reject
    afterTrunkBase = validated;
  }

  const result: SmartCropResult = {
    before: { left: bc.left, top: bc.top, width: bc.width, height: bc.height },
    after: { left: ac.left, top: ac.top, width: ac.width, height: ac.height },
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };

  if (beforeTrunkBase) result.beforeTrunkBase = beforeTrunkBase;
  if (afterTrunkBase) result.afterTrunkBase = afterTrunkBase;

  return result;
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
