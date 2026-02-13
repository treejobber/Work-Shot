/**
 * Social media output layer entry point.
 *
 * Reads R1 manifest to resolve source images, then generates
 * platform-specific outputs in output/social/<platform>/.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { JobMeta } from "../contracts";
import { assertResolvedContainedIn } from "../lib/pathSafety";
import type { SocialOutput } from "./types";
import { getAdapter, getAvailablePlatforms } from "./registry";
import { composeSocialImage } from "./composer";
import { generateSocialCaption } from "./captionWriter";
import { getSmartCrop } from "./smartCrop";
import { generateCrossfadeGif } from "./crossfade";

export { getAvailablePlatforms };

/**
 * Minimal manifest shape read from R1 output.
 * Defined locally to avoid importing from src/pipeline/ internals.
 */
interface R1Manifest {
  jobId: string;
  inputs: {
    mediaPairs: Array<{
      pairId: string;
      before: string;
      after: string;
      mediaType: string;
    }>;
  };
}

/** Per-platform social manifest. */
interface SocialManifest {
  schemaVersion: string;
  platform: string;
  generatedAt: string;
  r1ManifestRef: string;
  image: {
    path: string;
    width: number;
    height: number;
    sizeBytes: number;
    format: string;
    sha256: string;
  };
  caption: {
    path: string;
    charCount: number;
  };
  transition?: {
    path: string;
    sizeBytes: number;
    frameCount: number;
    durationMs: number;
    width: number;
    height: number;
    sha256: string;
  };
}

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Run social output generation for the given platforms.
 *
 * Requires R1 `run` to have completed (reads output/manifest.json).
 * Writes to output/social/<platform>/.
 */
export async function runSocial(
  jobDir: string,
  platforms: string[]
): Promise<SocialOutput[]> {
  const resolvedJobDir = path.resolve(jobDir);
  const outputDir = path.join(resolvedJobDir, "output");
  const manifestPath = path.join(outputDir, "manifest.json");

  // Verify R1 has run
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `R1 manifest not found at ${manifestPath}. Run 'workshot run' first.`
    );
  }

  // Read R1 manifest
  const manifest: R1Manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8")
  );

  // Resolve source image paths from manifest
  const mediaPair = manifest.inputs.mediaPairs[0];
  if (!mediaPair) {
    throw new Error("R1 manifest has no media pairs.");
  }

  // Resolve and enforce containment within jobDir
  const beforePath = path.resolve(outputDir, mediaPair.before);
  const afterPath = path.resolve(outputDir, mediaPair.after);

  assertResolvedContainedIn(beforePath, resolvedJobDir, "Before image path");
  assertResolvedContainedIn(afterPath, resolvedJobDir, "After image path");

  if (!fs.existsSync(beforePath)) {
    throw new Error(`Before image not found: ${beforePath}`);
  }
  if (!fs.existsSync(afterPath)) {
    throw new Error(`After image not found: ${afterPath}`);
  }

  // Extract job metadata
  const meta: JobMeta = {
    service: manifest.jobId,
  };

  // Try to read job.json for richer metadata
  const jobJsonPath = path.join(resolvedJobDir, "job.json");
  if (fs.existsSync(jobJsonPath)) {
    try {
      const jobJson = JSON.parse(fs.readFileSync(jobJsonPath, "utf-8"));
      if (jobJson.work?.service) meta.service = jobJson.work.service;
      if (jobJson.work?.notes) meta.notes = jobJson.work.notes;
    } catch {
      // Fall through — use manifest-derived metadata
    }
  }

  // Ensure social output root
  const socialDir = path.join(outputDir, "social");
  assertResolvedContainedIn(socialDir, resolvedJobDir, "Social output directory");
  fs.mkdirSync(socialDir, { recursive: true });

  const results: SocialOutput[] = [];

  for (const platformName of platforms) {
    const adapter = getAdapter(platformName);
    const spec = adapter.spec;

    // Create platform output directory
    const platformDir = path.join(socialDir, spec.name);
    assertResolvedContainedIn(platformDir, resolvedJobDir, `Platform directory (${spec.name})`);
    fs.mkdirSync(platformDir, { recursive: true });

    // Attempt smart-crop (returns null if unavailable/fails — composer uses center-crop)
    const panelWidth = spec.layout === "side-by-side"
      ? Math.floor(spec.imageSpec.width / 2)
      : spec.imageSpec.width;
    const panelHeight = spec.layout === "side-by-side"
      ? spec.imageSpec.height
      : Math.floor(spec.imageSpec.height / 2);

    const smartCrop = await getSmartCrop(beforePath, afterPath, panelWidth, panelHeight);

    // Compose image
    const ext = spec.imageSpec.format === "jpeg" ? "jpg" : "png";
    const imagePath = path.join(platformDir, `image.${ext}`);
    const imageResult = await composeSocialImage(
      beforePath,
      afterPath,
      imagePath,
      spec,
      smartCrop
    );

    // Generate caption
    const caption = generateSocialCaption(meta, spec);
    const captionPath = path.join(platformDir, "caption.txt");
    fs.writeFileSync(captionPath, caption, "utf-8");

    // Attempt crossfade GIF (only if WORKSHOT_SOCIAL_GIF=1)
    let transitionData: SocialManifest["transition"] | undefined;
    let transitionOutput: SocialOutput["transition"] | undefined;

    if (process.env.WORKSHOT_SOCIAL_GIF === "1") {
      const gifPath = path.join(platformDir, "transition.gif");
      const gifResult = await generateCrossfadeGif(beforePath, afterPath, gifPath);
      if (gifResult) {
        transitionData = {
          path: "transition.gif",
          sizeBytes: gifResult.sizeBytes,
          frameCount: gifResult.frameCount,
          durationMs: gifResult.durationMs,
          width: gifResult.width,
          height: gifResult.height,
          sha256: sha256File(gifPath),
        };
        transitionOutput = {
          path: gifResult.path,
          sizeBytes: gifResult.sizeBytes,
          frameCount: gifResult.frameCount,
          durationMs: gifResult.durationMs,
          width: gifResult.width,
          height: gifResult.height,
        };
        console.log(`[${spec.name}] Wrote ${gifPath}`);
      }
    }

    // Write per-platform manifest
    const socialManifest: SocialManifest = {
      schemaVersion: "1.0",
      platform: spec.name,
      generatedAt: new Date().toISOString(),
      r1ManifestRef: toForwardSlash(path.relative(platformDir, manifestPath)),
      image: {
        path: `image.${ext}`,
        width: imageResult.width,
        height: imageResult.height,
        sizeBytes: imageResult.sizeBytes,
        format: spec.imageSpec.format,
        sha256: sha256File(imagePath),
      },
      caption: {
        path: "caption.txt",
        charCount: caption.length,
      },
    };
    if (transitionData) {
      socialManifest.transition = transitionData;
    }
    const manifestOutputPath = path.join(platformDir, "manifest.json");
    fs.writeFileSync(manifestOutputPath, JSON.stringify(socialManifest, null, 2), "utf-8");

    const result: SocialOutput = {
      platform: spec.name,
      imagePath,
      captionPath,
      imageWidth: imageResult.width,
      imageHeight: imageResult.height,
      imageSizeBytes: imageResult.sizeBytes,
      captionLength: caption.length,
    };
    if (transitionOutput) {
      result.transition = transitionOutput;
    }
    results.push(result);

    console.log(`[${spec.name}] Wrote ${imagePath}`);
    console.log(`[${spec.name}] Wrote ${captionPath}`);
    console.log(`[${spec.name}] Wrote ${manifestOutputPath}`);
  }

  return results;
}
