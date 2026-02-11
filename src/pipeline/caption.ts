import type { JobMeta } from "../contracts";

/**
 * Generate a deterministic caption based on job metadata.
 * No AI, no customer PII.
 */
export function generateCaption(meta: JobMeta | null): string {
  const service = meta?.service ?? "work";
  const notes = meta?.notes;

  let caption = `Before & after from today's ${service} 🌳\n`;

  if (notes) {
    caption += `${notes}\n`;
  }

  caption += `If you've got a tree that needs attention, message us.`;

  return caption;
}
