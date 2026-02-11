import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { createTestJob, cleanupTestJob } from "./fixtures";

const NODE = process.execPath;
const CLI = path.resolve(__dirname, "..", "dist", "index.js");

function run(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      NODE,
      [CLI, ...args],
      { cwd: cwd ?? path.resolve(__dirname, "..") },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          code: error?.code ?? 0,
        });
      }
    );
  });
}

function sha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ---- Tier-1: Structural determinism (required gate, cross-platform) ----

describe("Tier-1 determinism (structural)", () => {
  let jobDir: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "determinism-t1",
        work: { service: "tree trim", notes: "Determinism test" },
        media: {
          pairs: [
            {
              pairId: "primary",
              before: "before.png",
              after: "after.png",
              mediaType: "photo",
            },
          ],
        },
      },
    });
  });

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("run succeeds", async () => {
    const result = await run(["run", jobDir]);
    expect(result.code).toBe(0);
  });

  // --- Deterministic artifact naming ---

  it("produces exactly before_after.png, caption.generic.txt, manifest.json", () => {
    const outputDir = path.join(jobDir, "output");
    const files = fs.readdirSync(outputDir).sort();
    expect(files).toEqual([
      "before_after.png",
      "caption.generic.txt",
      "manifest.json",
    ]);
  });

  // --- Manifest structure invariants ---

  it("manifest has expected schema structure (ignoring volatile fields)", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(jobDir, "output", "manifest.json"), "utf-8")
    );

    // Fixed structural fields
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.jobId).toBe("determinism-t1");
    expect(manifest.layout).toBe("side-by-side");

    // Inputs structure
    expect(manifest.inputs.jobFile).toContain("job.json");
    expect(manifest.inputs.mediaPairs).toHaveLength(1);
    expect(manifest.inputs.mediaPairs[0].pairId).toBe("primary");
    expect(manifest.inputs.mediaPairs[0].before).toContain("before.png");
    expect(manifest.inputs.mediaPairs[0].after).toContain("after.png");

    // Artifacts structure
    expect(manifest.artifacts).toHaveLength(1);
    expect(manifest.artifacts[0].artifactId).toBe("primary-composite");
    expect(manifest.artifacts[0].kind).toBe("media");
    expect(manifest.artifacts[0].role).toBe("composite");
    expect(manifest.artifacts[0].path).toBe("before_after.png");
    expect(manifest.artifacts[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    // Caption structure
    expect(manifest.captions.generic.path).toBe("caption.generic.txt");
    expect(manifest.captions.generic.charCount).toBeGreaterThan(0);

    // Platform stubs
    for (const platform of ["facebook", "instagram", "google_business_profile", "tiktok", "youtube"]) {
      expect(manifest.captions.platform[platform].status).toBe("not_generated");
      expect(manifest.captions.platform[platform].fallback).toBe("generic");
    }

    // Targets
    expect(manifest.targets.publish).toBe(false);

    // Warnings should be empty for clean job.json run
    expect(manifest.warnings).toEqual([]);
  });

  // --- Layout dimension invariants ---

  it("composite image has expected dimensions for side-by-side layout", async () => {
    const sharp = (await import("sharp")).default;
    const compositePath = path.join(jobDir, "output", "before_after.png");
    const meta = await sharp(compositePath).metadata();

    // Input fixtures are 200x150. Side-by-side: width = 200+200 = 400, height = max(150,150) = 150
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(150);
    expect(meta.format).toBe("png");
  });

  it("manifest artifact dimensions match actual image", async () => {
    const sharp = (await import("sharp")).default;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(jobDir, "output", "manifest.json"), "utf-8")
    );
    const compositePath = path.join(jobDir, "output", "before_after.png");
    const meta = await sharp(compositePath).metadata();

    expect(manifest.artifacts[0].width).toBe(meta.width);
    expect(manifest.artifacts[0].height).toBe(meta.height);
  });

  it("manifest artifact sha256 matches actual file hash", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(jobDir, "output", "manifest.json"), "utf-8")
    );
    const actualHash = sha256(path.join(jobDir, "output", "before_after.png"));
    expect(manifest.artifacts[0].sha256).toBe(actualHash);
  });

  // --- Caption byte identity ---

  it("caption is byte-identical across two runs with same input", async () => {
    // First run already completed above. Read its caption.
    const caption1 = fs.readFileSync(
      path.join(jobDir, "output", "caption.generic.txt"),
      "utf-8"
    );

    // Run again into a second job dir with identical inputs
    const jobDir2 = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "determinism-t1",
        work: { service: "tree trim", notes: "Determinism test" },
        media: {
          pairs: [
            {
              pairId: "primary",
              before: "before.png",
              after: "after.png",
              mediaType: "photo",
            },
          ],
        },
      },
    });

    try {
      const result = await run(["run", jobDir2]);
      expect(result.code).toBe(0);

      const caption2 = fs.readFileSync(
        path.join(jobDir2, "output", "caption.generic.txt"),
        "utf-8"
      );

      expect(caption1).toBe(caption2);
      expect(Buffer.from(caption1).equals(Buffer.from(caption2))).toBe(true);
    } finally {
      cleanupTestJob(jobDir2);
    }
  });

  // --- Stacked layout dimension invariants ---

  it("composite image has expected dimensions for stacked layout", async () => {
    const jobDirStacked = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "determinism-stacked",
        work: { service: "tree trim" },
        media: {
          pairs: [
            {
              pairId: "primary",
              before: "before.png",
              after: "after.png",
              mediaType: "photo",
            },
          ],
        },
      },
    });

    try {
      const result = await run(["run", jobDirStacked, "--layout", "stacked"]);
      expect(result.code).toBe(0);

      const sharp = (await import("sharp")).default;
      const compositePath = path.join(jobDirStacked, "output", "before_after.png");
      const meta = await sharp(compositePath).metadata();

      // Input fixtures are 200x150. Stacked: width = max(200,200) = 200, height = 150+150 = 300
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(300);
    } finally {
      cleanupTestJob(jobDirStacked);
    }
  });
});

// ---- Tier-2: Byte-level determinism (non-blocking diagnostic, pinned env only) ----

describe("Tier-2 determinism (byte-level)", () => {
  it("image hash is identical across two consecutive runs with same input", async () => {
    // Run 1
    const jobDir1 = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "determinism-t2",
        work: { service: "tree trim", notes: "Hash test" },
        media: {
          pairs: [
            {
              pairId: "primary",
              before: "before.png",
              after: "after.png",
              mediaType: "photo",
            },
          ],
        },
      },
    });

    // Run 2 (identical input)
    const jobDir2 = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "determinism-t2",
        work: { service: "tree trim", notes: "Hash test" },
        media: {
          pairs: [
            {
              pairId: "primary",
              before: "before.png",
              after: "after.png",
              mediaType: "photo",
            },
          ],
        },
      },
    });

    try {
      const [result1, result2] = await Promise.all([
        run(["run", jobDir1]),
        run(["run", jobDir2]),
      ]);

      expect(result1.code).toBe(0);
      expect(result2.code).toBe(0);

      const hash1 = sha256(path.join(jobDir1, "output", "before_after.png"));
      const hash2 = sha256(path.join(jobDir2, "output", "before_after.png"));

      expect(hash1).toBe(hash2);
    } finally {
      cleanupTestJob(jobDir1);
      cleanupTestJob(jobDir2);
    }
  });
});
