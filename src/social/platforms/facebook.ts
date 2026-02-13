/**
 * Facebook platform adapter.
 *
 * Specs (verified 2026-02-13):
 * - Image: 1080x1350, 4:5 portrait, JPEG, max 10MB
 * - Caption: ~8192 chars, no hashtags
 * - Layout: stacked (before on top, after on bottom)
 */

import type { PlatformAdapter, PlatformSpec } from "../types";

const FACEBOOK_SPEC: PlatformSpec = {
  name: "facebook",
  imageSpec: {
    width: 1080,
    height: 1350,
    format: "jpeg",
    quality: 90,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  },
  captionSpec: {
    maxLength: 8192,
    hashtags: "none",
  },
  layout: "stacked",
};

export function createFacebookAdapter(): PlatformAdapter {
  return { spec: FACEBOOK_SPEC };
}
