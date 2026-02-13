/**
 * Crossfade GIF generator — creates smooth animated transitions
 * between before/after images.
 *
 * Promoted from scripts/test-crossfade.ts (R3.4).
 *
 * Requires sharp-gif2 (devDependency, dynamically imported).
 * Returns null if:
 * - sharp-gif2 is not installed
 * - Generation fails for any reason
 *
 * Caller should treat null as "GIF not available" and continue.
 */

import * as fs from "fs";
import sharp from "sharp";

/** Options for crossfade GIF generation. */
export interface CrossfadeOptions {
  /** Number of transition frames between before and after (default: 20). */
  frameCount: number;
  /** Delay per transition frame in ms (default: 80). */
  frameDelay: number;
  /** Hold time on the "before" image in ms (default: 1500). */
  holdBefore: number;
  /** Hold time on the "after" image in ms (default: 6000). */
  holdAfter: number;
  /** Output width in pixels, height auto-scaled to match (default: 720). */
  outputWidth: number;
}

/** Result from successful crossfade GIF generation. */
export interface CrossfadeResult {
  /** Absolute path to the generated GIF file. */
  path: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Total number of frames (hold + transition + hold). */
  frameCount: number;
  /** Approximate duration in milliseconds. */
  durationMs: number;
  /** Frame dimensions. */
  width: number;
  height: number;
}

/** Deterministic defaults — no randomness, same inputs = same output. */
export const CROSSFADE_DEFAULTS: CrossfadeOptions = {
  frameCount: 20,
  frameDelay: 80,
  holdBefore: 1500,
  holdAfter: 6000,
  outputWidth: 720,
};

/**
 * Dynamic import function for sharp-gif2. Swappable for testing.
 * @internal
 */
let _importGif: () => Promise<any> = async () => {
  const mod = await import("sharp-gif2");
  return mod.default || mod;
};

/** Replace the import function (for testing). Returns the previous function. @internal */
export function _setImportGif(fn: () => Promise<any>): () => Promise<any> {
  const prev = _importGif;
  _importGif = fn;
  return prev;
}

/**
 * Generate a crossfade GIF transition between before and after images.
 *
 * Returns null if sharp-gif2 is unavailable or generation fails.
 * Caller should continue without GIF in that case.
 */
export async function generateCrossfadeGif(
  beforePath: string,
  afterPath: string,
  outputPath: string,
  options?: Partial<CrossfadeOptions>
): Promise<CrossfadeResult | null> {
  // Dynamic import — graceful failure if package not installed
  let GIF: any;
  try {
    GIF = await _importGif();
  } catch {
    console.warn("[crossfade] sharp-gif2 not available, skipping GIF generation");
    return null;
  }

  try {
    const opts: CrossfadeOptions = { ...CROSSFADE_DEFAULTS, ...options };

    // Resize both images to the same dimensions (RGBA for blending)
    const beforeResized = await sharp(beforePath)
      .resize(opts.outputWidth)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const afterResized = await sharp(afterPath)
      .resize(opts.outputWidth, beforeResized.info.height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = beforeResized.info;
    const channels = 4; // RGBA

    // Build frame list with per-frame delays
    const sharpFrames: sharp.Sharp[] = [];
    const delays: number[] = [];

    // Hold on "before" image
    sharpFrames.push(
      sharp(Buffer.from(beforeResized.data), {
        raw: { width, height, channels },
      }).png()
    );
    delays.push(opts.holdBefore);

    // Crossfade transition frames
    for (let i = 1; i <= opts.frameCount; i++) {
      const alpha = i / (opts.frameCount + 1); // 0 < alpha < 1
      const beforeData = beforeResized.data;
      const afterData = afterResized.data;

      const blended = Buffer.alloc(beforeData.length);
      for (let j = 0; j < beforeData.length; j++) {
        blended[j] = Math.round(beforeData[j] * (1 - alpha) + afterData[j] * alpha);
      }

      sharpFrames.push(
        sharp(blended, { raw: { width, height, channels } }).png()
      );
      delays.push(opts.frameDelay);
    }

    // Hold on "after" image
    sharpFrames.push(
      sharp(Buffer.from(afterResized.data), {
        raw: { width, height, channels },
      }).png()
    );
    delays.push(opts.holdAfter);

    // Encode animated GIF
    const gif = GIF.createGif({ delay: delays, repeat: 0, maxColors: 256 });
    for (const frame of sharpFrames) {
      gif.addFrame(frame);
    }
    const gifResult = await gif.toSharp();
    await gifResult.toFile(outputPath);

    const sizeBytes = fs.statSync(outputPath).size;

    // Read actual frame count from encoded GIF (encoder may merge frames)
    const gifMeta = await sharp(outputPath).metadata();
    const actualFrames = gifMeta.pages ?? sharpFrames.length;

    // Compute duration from actual encoded delays if available, else from options
    const actualDelays = gifMeta.delay as number[] | undefined;
    const durationMs = actualDelays
      ? actualDelays.reduce((sum, d) => sum + d, 0)
      : opts.holdBefore + opts.holdAfter + opts.frameCount * opts.frameDelay;

    return {
      path: outputPath,
      sizeBytes,
      frameCount: actualFrames,
      durationMs,
      width,
      height,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[crossfade] GIF generation failed: ${msg}`);
    return null;
  }
}
