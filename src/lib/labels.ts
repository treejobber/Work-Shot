/**
 * Shared SVG label rendering for before/after composites.
 *
 * R1 compose.ts is frozen and retains its own copy of the old style.
 * This module is used by the social layer with improved label styling.
 */

export const LABEL_FONT_SIZE = 36;
export const LABEL_PADDING_H = 20;
export const LABEL_PADDING_V = 12;
export const LABEL_MARGIN = 20;
export const LABEL_BG_COLOR = "rgba(0,0,0,0.55)";
export const LABEL_TEXT_COLOR = "#FFFFFF";
export const LABEL_BORDER_RADIUS = 8;

/**
 * Create an SVG overlay with a label (e.g. "BEFORE" or "AFTER").
 * Returns a Buffer containing the SVG markup.
 */
export function createLabelSvg(
  label: string,
  panelWidth: number,
  panelHeight: number
): Buffer {
  // Conservative char width estimate for sans-serif at this size.
  // Overestimate slightly to ensure text never overflows the pill.
  const charWidth = LABEL_FONT_SIZE * 0.65;
  const textWidth = label.length * charWidth;
  const boxWidth = textWidth + LABEL_PADDING_H * 2;
  const boxHeight = LABEL_FONT_SIZE + LABEL_PADDING_V * 2;

  const textX = LABEL_MARGIN + LABEL_PADDING_H;
  const textY = LABEL_MARGIN + LABEL_PADDING_V + LABEL_FONT_SIZE * 0.78;

  const svg = `
<svg width="${panelWidth}" height="${panelHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .label-text {
        font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        font-size: ${LABEL_FONT_SIZE}px;
        font-weight: 700;
        fill: ${LABEL_TEXT_COLOR};
        letter-spacing: 1.5px;
        text-transform: uppercase;
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
    x="${textX}"
    y="${textY}"
    class="label-text"
  >${label}</text>
</svg>`;

  return Buffer.from(svg);
}
