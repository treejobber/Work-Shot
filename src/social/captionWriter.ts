/**
 * Platform-specific caption generation.
 *
 * Same deterministic, template-based approach as R1.
 * Each platform gets a caption respecting its character limits and conventions.
 */

import type { JobMeta } from "../contracts";
import type { PlatformSpec } from "./types";

/**
 * Generate a platform-specific caption from job metadata.
 * Deterministic — no LLM, no randomness.
 */
export function generateSocialCaption(
  meta: JobMeta | null,
  spec: PlatformSpec
): string {
  const service = meta?.service ?? "work";
  const notes = meta?.notes;

  let caption = `Before & after from today's ${service}\n`;

  if (notes) {
    caption += `${notes}\n`;
  }

  caption += `If you've got a tree that needs attention, message us.`;

  // Truncate to platform limit if needed
  if (caption.length > spec.captionSpec.maxLength) {
    caption = caption.slice(0, spec.captionSpec.maxLength - 3) + "...";
  }

  return caption;
}
