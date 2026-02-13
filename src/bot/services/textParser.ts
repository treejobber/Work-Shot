/**
 * Recognized service keywords for tree service businesses.
 * Matched as case-insensitive prefix of the text.
 */
const SERVICE_KEYWORDS = [
  "tree removal",
  "tree trim",
  "stump removal",
  "stump grinding",
  "brush clearing",
  "hedge trim",
  "lot clearing",
  "limb removal",
] as const;

export interface ParsedText {
  service: string;
  notes: string;
}

/**
 * Parses text for a recognized service keyword.
 * If text starts with a known keyword, that becomes the service.
 * Full text is always saved as notes.
 */
export function parseServiceText(text: string): ParsedText {
  const lower = text.toLowerCase().trim();

  for (const keyword of SERVICE_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      return { service: keyword, notes: text.trim() };
    }
  }

  return { service: "tree trim", notes: text.trim() };
}
