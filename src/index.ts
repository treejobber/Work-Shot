import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import sharp from "sharp";
import { parseArgs } from "./cli/parseArgs";
import { ingestJob, validateJob } from "./pipeline/ingest";
import { composeImage } from "./pipeline/compose";
import { generateCaption } from "./pipeline/caption";
import { generateManifest, writeManifest } from "./pipeline/manifest";
import { assertResolvedContainedIn, PathEscapeError } from "./lib/pathSafety";
import { runSocial, getAvailablePlatforms } from "./social";
import type { Layout, IngestResult } from "./contracts";

// --- Run Pipeline ---

async function runPipeline(jobDir: string, layout: Layout, warnings: string[]): Promise<void> {
  const outputDir = path.join(jobDir, "output");

  // Verify output dir is contained within jobDir
  try {
    assertResolvedContainedIn(outputDir, jobDir, "Output directory");
  } catch (err) {
    if (err instanceof PathEscapeError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  // Ingest
  let ingestResult: IngestResult;
  try {
    ingestResult = await ingestJob(jobDir);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  // Ensure output directory
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    console.error(`Error: Cannot create output directory ${outputDir}`);
    console.error((err as Error).message);
    process.exit(1);
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
    console.log(`Wrote ${compositeOutputPath}`);
  } catch (err) {
    console.error(`Error composing image: ${(err as Error).message}`);
    process.exit(1);
  }

  // Read composite dimensions for manifest
  const compositeMeta = await sharp(compositeOutputPath).metadata();
  const compositeWidth = compositeMeta.width ?? 0;
  const compositeHeight = compositeMeta.height ?? 0;

  // Generate caption
  const captionOutputPath = path.join(outputDir, "caption.generic.txt");
  try {
    const caption = generateCaption(ingestResult.meta);
    fs.writeFileSync(captionOutputPath, caption, "utf-8");
    console.log(`Wrote ${captionOutputPath}`);
  } catch (err) {
    console.error(`Error writing caption: ${(err as Error).message}`);
    process.exit(1);
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
      warnings,
    });
    writeManifest(manifest, manifestOutputPath);
    console.log(`Wrote ${manifestOutputPath}`);
  } catch (err) {
    console.error(`Error writing manifest: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log("Done.");
}

// --- Validate Command ---

function runValidate(jobDir: string): void {
  const result = validateJob(jobDir);

  for (const w of result.warnings) {
    console.error(`Warning: ${w}`);
  }
  for (const e of result.errors) {
    console.error(`Error: ${e}`);
  }

  if (result.valid) {
    console.log(`Validation passed: ${jobDir}`);
  } else {
    console.error(`Validation failed: ${jobDir}`);
    process.exit(1);
  }
}

// --- Social Command ---

async function runSocialCommand(jobDir: string, platforms: string[], all: boolean): Promise<void> {
  const targetPlatforms = all ? getAvailablePlatforms() : platforms;

  if (targetPlatforms.length === 0) {
    console.error("Error: No platforms to generate for.");
    process.exit(1);
  }

  try {
    const results = await runSocial(jobDir, targetPlatforms);
    console.log(`Done. Generated ${results.length} platform output(s).`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// --- Main ---

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.command === "validate") {
    runValidate(parsed.jobDir);
    return;
  }

  if (parsed.command === "social") {
    // Load .env for GEMINI_API_KEY (smart-crop) without overriding existing env vars.
    // Missing .env or missing key is non-fatal — smart-crop falls back to center-crop.
    dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });
    await runSocialCommand(parsed.jobDir, parsed.platforms, parsed.all);
    return;
  }

  // parsed.command === "run"
  console.log(`Processing ${parsed.jobDir}...`);
  await runPipeline(parsed.jobDir, parsed.layout, []);
}

main();
