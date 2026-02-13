/**
 * Nextdoor platform adapter.
 *
 * Specs (verified 2026-02-12):
 * - Image: 1200x675, 16:9 landscape, JPEG, max 10MB
 * - Caption: ~8192 chars, no hashtags
 * - Layout: side-by-side
 */

import type { PlatformAdapter, PlatformSpec } from "../types";

const NEXTDOOR_SPEC: PlatformSpec = {
  name: "nextdoor",
  imageSpec: {
    width: 1200,
    height: 675,
    format: "jpeg",
    quality: 90,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  },
  captionSpec: {
    maxLength: 8192,
    hashtags: "none",
  },
  layout: "side-by-side",
};

export function createNextdoorAdapter(): PlatformAdapter {
  return { spec: NEXTDOOR_SPEC };
}
