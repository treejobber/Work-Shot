/**
 * Platform-aware image composition.
 *
 * Takes original before/after source images, center-crops each panel
 * to fit the platform's target dimensions, adds BEFORE/AFTER labels,
 * overlays business logo, and outputs a single composite in the
 * platform's required format.
 */

import * as path from "path";
import sharp from "sharp";
import type { PlatformSpec } from "./types";
import type { SmartCropResult } from "./smartCrop";
import { createLabelSvg } from "../lib/labels";

/** Logo sizing: width as fraction of final image width */
const LOGO_WIDTH_FRACTION = 0.10;
/** Logo opacity (0.0 = invisible, 1.0 = fully opaque) */
const LOGO_OPACITY = 0.4;
/** Logo margin from bottom-left corner in pixels */
const LOGO_MARGIN = 16;
/** Path to the business logo file */
const LOGO_PATH = path.resolve(__dirname, "..", "..", "assets", "logo.png");

/**
 * Compose a platform-specific before/after image.
 *
 * For side-by-side layout: each panel is half the target width.
 * For stacked layout: each panel is half the target height.
 * Images are center-cropped (cover) to fill their panel exactly.
 */
export async function composeSocialImage(
  beforePath: string,
  afterPath: string,
  outputPath: string,
  spec: PlatformSpec,
  smartCrop?: SmartCropResult | null
): Promise<{ width: number; height: number; sizeBytes: number }> {
  const { width: targetWidth, height: targetHeight, format, quality } = spec.imageSpec;

  let panelWidth: number;
  let panelHeight: number;

  if (spec.layout === "side-by-side") {
    panelWidth = Math.floor(targetWidth / 2);
    panelHeight = targetHeight;
  } else {
    panelWidth = targetWidth;
    panelHeight = Math.floor(targetHeight / 2);
  }

  // Crop each image to fill the panel exactly.
  // Smart-crop: extract region then resize to panel (Gemini-chosen subject framing).
  // Center-crop fallback: resize with cover fit (sharp's built-in center crop).
  let beforeBuffer: Buffer;
  let afterBuffer: Buffer;

  if (smartCrop) {
    beforeBuffer = await sharp(beforePath)
      .extract(smartCrop.before)
      .resize(panelWidth, panelHeight)
      .toBuffer();

    afterBuffer = await sharp(afterPath)
      .extract(smartCrop.after)
      .resize(panelWidth, panelHeight)
      .toBuffer();
  } else {
    beforeBuffer = await sharp(beforePath)
      .resize(panelWidth, panelHeight, { fit: "cover", position: "centre" })
      .toBuffer();

    afterBuffer = await sharp(afterPath)
      .resize(panelWidth, panelHeight, { fit: "cover", position: "centre" })
      .toBuffer();
  }

  // Create label overlays
  const beforeLabel = createLabelSvg("BEFORE", panelWidth, panelHeight);
  const afterLabel = createLabelSvg("AFTER", panelWidth, panelHeight);

  // Composite labels onto panels
  const beforeWithLabel = await sharp(beforeBuffer)
    .composite([{ input: beforeLabel, top: 0, left: 0 }])
    .toBuffer();

  const afterWithLabel = await sharp(afterBuffer)
    .composite([{ input: afterLabel, top: 0, left: 0 }])
    .toBuffer();

  // Compose final image
  let beforeTop: number;
  let beforeLeft: number;
  let afterTop: number;
  let afterLeft: number;

  if (spec.layout === "side-by-side") {
    beforeTop = 0;
    beforeLeft = 0;
    afterTop = 0;
    afterLeft = panelWidth;
  } else {
    beforeTop = 0;
    beforeLeft = 0;
    afterTop = panelHeight;
    afterLeft = 0;
  }

  // Prepare logo overlay (small, bottom-left, semi-transparent)
  const logoTargetWidth = Math.round(targetWidth * LOGO_WIDTH_FRACTION);

  // Resize logo to target width, get PNG buffer, then read back for dimensions
  const logoPng = await sharp(LOGO_PATH)
    .resize(logoTargetWidth, null, { fit: "inside" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const logoMeta = await sharp(logoPng).metadata();
  const logoW = logoMeta.width!;
  const logoH = logoMeta.height!;

  // Extract raw RGBA pixels, scale alpha for opacity, convert back to PNG
  const rawPixels = await sharp(logoPng).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < rawPixels.length; i += 4) {
    rawPixels[i] = Math.round(rawPixels[i] * LOGO_OPACITY);
  }
  const logoOverlay = await sharp(rawPixels, {
    raw: { width: logoW, height: logoH, channels: 4 },
  })
    .png()
    .toBuffer();

  const logoTop = targetHeight - logoH - LOGO_MARGIN;
  const logoLeft = LOGO_MARGIN;

  let pipeline = sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).composite([
    { input: beforeWithLabel, top: beforeTop, left: beforeLeft },
    { input: afterWithLabel, top: afterTop, left: afterLeft },
    { input: logoOverlay, top: logoTop, left: logoLeft },
  ]);

  if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false });
  }

  const outputInfo = await pipeline.toFile(outputPath);

  return {
    width: outputInfo.width,
    height: outputInfo.height,
    sizeBytes: outputInfo.size,
  };
}
