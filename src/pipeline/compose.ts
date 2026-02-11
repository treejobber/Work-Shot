import sharp from "sharp";
import type { Layout } from "../contracts";

// Re-export so existing consumers of compose don't break.
export type { Layout };

const MAX_PANEL_WIDTH = 1080;
const LABEL_FONT_SIZE = 64;
const LABEL_PADDING = 16;
const LABEL_MARGIN = 24;
const LABEL_BG_COLOR = "rgba(0,0,0,0.45)";
const LABEL_TEXT_COLOR = "#FFFFFF";
const LABEL_BORDER_RADIUS = 12;

// Explicit PNG output settings for deterministic output across environments.
// Re-baseline Tier-2 hashes when changing these values or upgrading sharp.
const PNG_OUTPUT_OPTIONS: import("sharp").PngOptions = {
  compressionLevel: 9,
  adaptiveFiltering: false,
  palette: false,
};

/**
 * Create an SVG overlay with a label (BEFORE or AFTER).
 */
function createLabelSvg(
  label: string,
  panelWidth: number,
  panelHeight: number
): Buffer {
  const charWidth = 38;
  const textWidth = label.length * charWidth;
  const boxWidth = textWidth + LABEL_PADDING * 2;
  const boxHeight = LABEL_FONT_SIZE + LABEL_PADDING * 2;

  const svg = `
<svg width="${panelWidth}" height="${panelHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .label-text {
        font-family: Arial, sans-serif;
        font-size: ${LABEL_FONT_SIZE}px;
        font-weight: 600;
        fill: ${LABEL_TEXT_COLOR};
      }
    </style>
  </defs>
  <rect
    x="${LABEL_MARGIN}"
    y="${LABEL_MARGIN}"
    width="${boxWidth}"
    height="${boxHeight}"
    rx="${LABEL_BORDER_RADIUS}"
    ry="${LABEL_BORDER_RADIUS}"
    fill="${LABEL_BG_COLOR}"
  />
  <text
    x="${LABEL_MARGIN + LABEL_PADDING}"
    y="${LABEL_MARGIN + LABEL_PADDING + LABEL_FONT_SIZE * 0.8}"
    class="label-text"
  >${label}</text>
</svg>`;

  return Buffer.from(svg);
}

/**
 * Compose before and after images into a single output image.
 * - Normalizes both to the same width (never upscales)
 * - Adds BEFORE/AFTER labels
 * - Supports side-by-side or stacked layout
 */
export async function composeImage(
  beforePath: string,
  afterPath: string,
  outputPath: string,
  layout: Layout
): Promise<void> {
  // Load images and get metadata
  const beforeImage = sharp(beforePath);
  const afterImage = sharp(afterPath);

  const [beforeMeta, afterMeta] = await Promise.all([
    beforeImage.metadata(),
    afterImage.metadata(),
  ]);

  if (!beforeMeta.width || !beforeMeta.height) {
    throw new Error(`Cannot read dimensions from before image: ${beforePath}`);
  }
  if (!afterMeta.width || !afterMeta.height) {
    throw new Error(`Cannot read dimensions from after image: ${afterPath}`);
  }

  // Determine target panel width: min of both widths, capped at MAX_PANEL_WIDTH
  // Never upscale
  const targetWidth = Math.min(
    MAX_PANEL_WIDTH,
    beforeMeta.width,
    afterMeta.width
  );

  // Resize both images to target width (preserve aspect ratio)
  const beforeResized = await sharp(beforePath)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const afterResized = await sharp(afterPath)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const beforeWidth = beforeResized.info.width;
  const beforeHeight = beforeResized.info.height;
  const afterWidth = afterResized.info.width;
  const afterHeight = afterResized.info.height;

  // Create label overlays
  const beforeLabelSvg = createLabelSvg("BEFORE", beforeWidth, beforeHeight);
  const afterLabelSvg = createLabelSvg("AFTER", afterWidth, afterHeight);

  // Composite labels onto images
  const beforeWithLabel = await sharp(beforeResized.data)
    .composite([{ input: beforeLabelSvg, top: 0, left: 0 }])
    .toBuffer();

  const afterWithLabel = await sharp(afterResized.data)
    .composite([{ input: afterLabelSvg, top: 0, left: 0 }])
    .toBuffer();

  // Compose final image based on layout
  if (layout === "side-by-side") {
    // Side by side: before left, after right
    // Heights may differ, so we need to extend the shorter one
    const maxHeight = Math.max(beforeHeight, afterHeight);
    const totalWidth = beforeWidth + afterWidth;

    await sharp({
      create: {
        width: totalWidth,
        height: maxHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        { input: beforeWithLabel, top: 0, left: 0 },
        { input: afterWithLabel, top: 0, left: beforeWidth },
      ])
      .png(PNG_OUTPUT_OPTIONS)
      .toFile(outputPath);
  } else {
    // Stacked: before top, after bottom
    const totalHeight = beforeHeight + afterHeight;
    const maxWidth = Math.max(beforeWidth, afterWidth);

    await sharp({
      create: {
        width: maxWidth,
        height: totalHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        { input: beforeWithLabel, top: 0, left: 0 },
        { input: afterWithLabel, top: beforeHeight, left: 0 },
      ])
      .png(PNG_OUTPUT_OPTIONS)
      .toFile(outputPath);
  }
}
