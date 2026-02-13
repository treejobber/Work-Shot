/**
 * Social media output layer types.
 *
 * PlatformAdapter is the pluggable interface — each platform implements it.
 * Adding a new platform means creating a new adapter and registering it.
 */

import type { Layout } from "../contracts";

/** Image specification for a platform. */
export interface ImageSpec {
  width: number;
  height: number;
  format: "jpeg" | "png";
  quality: number; // JPEG quality (1-100), ignored for PNG
  maxFileSizeBytes: number;
}

/** Caption specification for a platform. */
export interface CaptionSpec {
  maxLength: number;
  hashtags: "none" | "inline" | "block";
}

/** Full platform specification. */
export interface PlatformSpec {
  name: string;
  imageSpec: ImageSpec;
  captionSpec: CaptionSpec;
  layout: Layout;
}

/** Result of generating output for one platform. */
export interface SocialOutput {
  platform: string;
  imagePath: string;
  captionPath: string;
  imageWidth: number;
  imageHeight: number;
  imageSizeBytes: number;
  captionLength: number;
  /** Present only when GIF generation succeeded. */
  transition?: {
    path: string;
    sizeBytes: number;
    frameCount: number;
    durationMs: number;
    width: number;
    height: number;
  };
}

/** Adapter interface — each platform implements this. */
export interface PlatformAdapter {
  readonly spec: PlatformSpec;
}
