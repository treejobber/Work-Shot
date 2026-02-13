import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { ingestJob } from "../../pipeline/ingest";
import { composeImage } from "../../pipeline/compose";
import { generateCaption } from "../../pipeline/caption";
import { generateManifest, writeManifest } from "../../pipeline/manifest";
import { assertResolvedContainedIn } from "../../lib/pathSafety";
import type { Layout } from "../../contracts";
import type { PipelineResult } from "../types";

/**
 * Runs the R1 pipeline in-process. Does NOT call process.exit() —
 * returns a structured PipelineResult instead.
 *
 * This is functionally identical to src/index.ts:runPipeline, but:
 * 1. Returns errors instead of calling process.exit(1)
 * 2. Safe to call from a long-running bot process
 *
 * A parity test verifies this produces identical output to the CLI.
 */
export async function runPipeline(
  jobDir: string,
  layout: Layout = "side-by-side"
): Promise<PipelineResult> {
  const outputDir = path.join(jobDir, "output");

  // Verify output dir containment
  try {
    assertResolvedContainedIn(outputDir, jobDir, "Output directory");
  } catch (err) {
    return { success: false, error: `Path safety: ${(err as Error).message}` };
  }

  // Ingest
  let ingestResult;
  try {
    ingestResult = await ingestJob(jobDir);
  } catch (err) {
    return { success: false, error: `Ingest: ${(err as Error).message}` };
  }

  // Create output directory
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    return {
      success: false,
      error: `Cannot create output directory: ${(err as Error).message}`,
    };
  }

  // Compose image
  const compositeOutputPath = path.join(outputDir, "before_after.png");
  try {
    await composeImage(
      ingestResult.beforePath,
      ingestResult.afterPath,
      compositeOutputPath,
      layout
    );
  } catch (err) {
    return {
      success: false,
      error: `Compose: ${(err as Error).message}`,
    };
  }

  // Read composite dimensions
  const compositeMeta = await sharp(compositeOutputPath).metadata();
  const compositeWidth = compositeMeta.width ?? 0;
  const compositeHeight = compositeMeta.height ?? 0;

  // Generate caption
  const captionOutputPath = path.join(outputDir, "caption.generic.txt");
  let captionText: string;
  try {
    captionText = generateCaption(ingestResult.meta);
    fs.writeFileSync(captionOutputPath, captionText, "utf-8");
  } catch (err) {
    return {
      success: false,
      error: `Caption: ${(err as Error).message}`,
    };
  }

  // Generate and write manifest
  const manifestOutputPath = path.join(outputDir, "manifest.json");
  try {
    const manifest = generateManifest({
      ingestResult,
      layout,
      compositeOutputPath,
      captionOutputPath,
      outputDir,
      compositeWidth,
      compositeHeight,
      warnings: [],
    });
    writeManifest(manifest, manifestOutputPath);
  } catch (err) {
    return {
      success: false,
      error: `Manifest: ${(err as Error).message}`,
    };
  }

  return {
    success: true,
    compositeOutputPath,
    captionOutputPath,
    manifestOutputPath,
    captionText,
  };
}
