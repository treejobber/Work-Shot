import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { Layout, IngestResult } from "../contracts";

export interface Manifest {
  schemaVersion: string;
  jobId: string;
  runId: string;
  generatedAt: string;
  layout: string;
  inputs: {
    jobFile: string;
    mediaPairs: Array<{
      pairId: string;
      before: string;
      after: string;
      mediaType: string;
    }>;
  };
  artifacts: Array<{
    artifactId: string;
    kind: string;
    mediaType: string;
    role: string;
    path: string;
    width: number;
    height: number;
    sha256: string;
  }>;
  captions: {
    generic: {
      path: string;
      charCount: number;
    };
    platform: Record<
      string,
      { status: string; fallback: string }
    >;
  };
  targets: {
    requestedPlatforms: string[];
    publish: boolean;
  };
  warnings: string[];
}

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

export function generateManifest(opts: {
  ingestResult: IngestResult;
  layout: Layout;
  compositeOutputPath: string;
  captionOutputPath: string;
  outputDir: string;
  compositeWidth: number;
  compositeHeight: number;
  warnings?: string[];
}): Manifest {
  const {
    ingestResult,
    layout,
    compositeOutputPath,
    captionOutputPath,
    outputDir,
    compositeWidth,
    compositeHeight,
    warnings = [],
  } = opts;

  const captionContent = fs.readFileSync(captionOutputPath, "utf-8");
  const compositeHash = sha256File(compositeOutputPath);

  const jobFileRef = toForwardSlash(
    path.relative(outputDir, path.join(ingestResult.jobDir, "job.json"))
  );

  const mediaPair = ingestResult.jobJson.media.pairs[0];

  return {
    schemaVersion: "1.0",
    jobId: ingestResult.jobJson.jobId,
    runId: `run-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    generatedAt: new Date().toISOString(),
    layout,
    inputs: {
      jobFile: jobFileRef,
      mediaPairs: [
        {
          pairId: mediaPair.pairId,
          before: toForwardSlash(
            path.relative(outputDir, ingestResult.beforePath)
          ),
          after: toForwardSlash(
            path.relative(outputDir, ingestResult.afterPath)
          ),
          mediaType: mediaPair.mediaType,
        },
      ],
    },
    artifacts: [
      {
        artifactId: "primary-composite",
        kind: "media",
        mediaType: "photo",
        role: "composite",
        path: toForwardSlash(path.relative(outputDir, compositeOutputPath)),
        width: compositeWidth,
        height: compositeHeight,
        sha256: compositeHash,
      },
    ],
    captions: {
      generic: {
        path: toForwardSlash(path.relative(outputDir, captionOutputPath)),
        charCount: captionContent.length,
      },
      platform: {
        facebook: { status: "not_generated", fallback: "generic" },
        instagram: { status: "not_generated", fallback: "generic" },
        google_business_profile: { status: "not_generated", fallback: "generic" },
        tiktok: { status: "not_generated", fallback: "generic" },
        youtube: { status: "not_generated", fallback: "generic" },
      },
    },
    targets: {
      requestedPlatforms: ingestResult.jobJson.targets.platforms,
      publish: ingestResult.jobJson.targets.publish,
    },
    warnings,
  };
}

export function writeManifest(manifest: Manifest, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
}
