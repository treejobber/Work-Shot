import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

export interface DownloadResult {
  localPath: string;
  width: number;
  height: number;
}

/**
 * Downloads a file from a URL to a local path and validates it is a readable image.
 * Returns the local path and image dimensions.
 */
export async function downloadAndValidatePhoto(
  fileUrl: string,
  destPath: string
): Promise<DownloadResult> {
  // Fetch the file
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download photo: HTTP ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Ensure the destination directory exists
  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true });

  // Write to disk
  fs.writeFileSync(destPath, buffer);

  // Validate with sharp — ensures it's a readable image
  const metadata = await sharp(destPath).metadata();
  if (!metadata.width || !metadata.height) {
    // Clean up invalid file
    fs.unlinkSync(destPath);
    throw new Error("Downloaded file is not a valid image (no dimensions).");
  }

  return {
    localPath: destPath,
    width: metadata.width,
    height: metadata.height,
  };
}

/**
 * Given a Telegram photo array, returns the file_id of the largest resolution.
 */
export function getLargestPhotoFileId(
  photos: Array<{ file_id: string; width: number; height: number }>
): string {
  if (photos.length === 0) {
    throw new Error("No photos in array.");
  }
  // Telegram sorts ascending by size — last element is largest
  return photos[photos.length - 1].file_id;
}

/** MIME types accepted as image documents */
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Returns true if a MIME type is an accepted image format for document uploads.
 */
export function isImageMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}
