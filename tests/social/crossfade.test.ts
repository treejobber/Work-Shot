/**
 * Crossfade GIF generator tests (R3.4).
 *
 * Tests cover:
 * - Disabled-by-default: no GIF generated without WORKSHOT_SOCIAL_GIF=1
 * - Enabled behavior: creates transition.gif with correct metadata
 * - Missing sharp-gif2: falls back gracefully (mocked import failure)
 * - Integration: runSocial with GIF toggle
 * - Manifest: transition block present when GIF enabled, absent when disabled
 * - R3.1/R3.2/R3.3 non-regression: existing behavior unchanged
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { createTestJob, cleanupTestJob } from "../fixtures";
import { generateCrossfadeGif, CROSSFADE_DEFAULTS, _setImportGif } from "../../src/social/crossfade";
import { runSocial } from "../../src/social";

const NODE = process.execPath;
const CLI = path.resolve(__dirname, "..", "..", "dist", "index.js");

function run(
  args: string[],
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      NODE,
      [CLI, ...args],
      {
        cwd: path.resolve(__dirname, "..", ".."),
        env: { ...process.env, ...env },
      },
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

// ---- Defaults ----

describe("crossfade defaults", () => {
  it("has deterministic default values", () => {
    expect(CROSSFADE_DEFAULTS.frameCount).toBe(20);
    expect(CROSSFADE_DEFAULTS.frameDelay).toBe(80);
    expect(CROSSFADE_DEFAULTS.holdBefore).toBe(1500);
    expect(CROSSFADE_DEFAULTS.holdAfter).toBe(6000);
    expect(CROSSFADE_DEFAULTS.outputWidth).toBe(720);
  });

  it("default duration is calculated correctly", () => {
    const d = CROSSFADE_DEFAULTS;
    const expected = d.holdBefore + d.holdAfter + d.frameCount * d.frameDelay;
    expect(expected).toBe(9100); // 1500 + 6000 + 20*80
  });
});

// ---- generateCrossfadeGif unit tests ----

describe("generateCrossfadeGif", () => {
  let jobDir: string;
  let beforePath: string;
  let afterPath: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "crossfade-unit",
        work: { service: "tree trim", notes: null },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });
    beforePath = path.join(jobDir, "before.png");
    afterPath = path.join(jobDir, "after.png");
  });

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("generates a GIF file with default options", async () => {
    const outputPath = path.join(jobDir, "test-crossfade.gif");
    const result = await generateCrossfadeGif(beforePath, afterPath, outputPath);

    expect(result).not.toBeNull();
    expect(result!.path).toBe(outputPath);
    expect(result!.sizeBytes).toBeGreaterThan(0);
    // frameCount is actual encoded GIF pages (encoder may merge similar frames)
    expect(result!.frameCount).toBeGreaterThan(0);
    expect(result!.durationMs).toBeGreaterThan(0);
    expect(result!.width).toBeGreaterThan(0);
    expect(result!.height).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
  }, 30000);

  it("generates GIF with custom options", async () => {
    const outputPath = path.join(jobDir, "test-crossfade-custom.gif");
    const result = await generateCrossfadeGif(beforePath, afterPath, outputPath, {
      frameCount: 5,
      frameDelay: 100,
      holdBefore: 500,
      holdAfter: 500,
      outputWidth: 320,
    });

    expect(result).not.toBeNull();
    // frameCount is actual encoded pages, not requested frames
    expect(result!.frameCount).toBeGreaterThan(0);
    expect(result!.durationMs).toBeGreaterThan(0);
  }, 30000);

  it("returns null when sharp-gif2 import fails", async () => {
    // Inject a failing import to simulate missing sharp-gif2
    const restore = _setImportGif(async () => {
      throw new Error("Cannot find module 'sharp-gif2'");
    });

    try {
      const outputPath = path.join(jobDir, "test-no-gif2.gif");
      const result = await generateCrossfadeGif(beforePath, afterPath, outputPath);
      expect(result).toBeNull();
      expect(fs.existsSync(outputPath)).toBe(false);
    } finally {
      _setImportGif(restore);
    }
  });

  it("returns null on image-read failure without throwing", async () => {
    const outputPath = path.join(jobDir, "test-fail.gif");
    const result = await generateCrossfadeGif(
      "/nonexistent/before.png",
      "/nonexistent/after.png",
      outputPath
    );
    expect(result).toBeNull();
  });
});

// ---- Disabled by default (no env var) ----

describe("crossfade disabled by default", () => {
  let jobDir: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "crossfade-disabled",
        work: { service: "tree trim", notes: "Disabled test" },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });
    // Run R1
    await new Promise<void>((resolve) => {
      execFile(NODE, [CLI, "run", jobDir], { cwd: path.resolve(__dirname, "..", "..") }, () => resolve());
    });
  }, 30000);

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("does not create transition.gif when env var not set", async () => {
    // Remove env var if set
    const oldVal = process.env.WORKSHOT_SOCIAL_GIF;
    delete process.env.WORKSHOT_SOCIAL_GIF;

    const results = await runSocial(jobDir, ["nextdoor"]);
    expect(results).toHaveLength(1);

    const gifPath = path.join(jobDir, "output", "social", "nextdoor", "transition.gif");
    expect(fs.existsSync(gifPath)).toBe(false);

    // SocialOutput should not have transition
    expect(results[0].transition).toBeUndefined();

    // Manifest should not have transition block
    const manifest = JSON.parse(
      fs.readFileSync(path.join(jobDir, "output", "social", "nextdoor", "manifest.json"), "utf-8")
    );
    expect(manifest.transition).toBeUndefined();

    // Restore
    if (oldVal !== undefined) process.env.WORKSHOT_SOCIAL_GIF = oldVal;
  });
});

// ---- Enabled behavior ----

describe("crossfade enabled with WORKSHOT_SOCIAL_GIF=1", () => {
  let jobDir: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "crossfade-enabled",
        work: { service: "tree trim", notes: "Enabled test" },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });
    // Run R1
    await new Promise<void>((resolve) => {
      execFile(NODE, [CLI, "run", jobDir], { cwd: path.resolve(__dirname, "..", "..") }, () => resolve());
    });
  }, 30000);

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("creates transition.gif when WORKSHOT_SOCIAL_GIF=1", async () => {
    const oldVal = process.env.WORKSHOT_SOCIAL_GIF;
    process.env.WORKSHOT_SOCIAL_GIF = "1";

    const results = await runSocial(jobDir, ["facebook"]);
    expect(results).toHaveLength(1);

    const gifPath = path.join(jobDir, "output", "social", "facebook", "transition.gif");
    expect(fs.existsSync(gifPath)).toBe(true);

    // SocialOutput has transition data
    expect(results[0].transition).toBeDefined();
    expect(results[0].transition!.sizeBytes).toBeGreaterThan(0);
    // frameCount is actual encoded GIF pages (encoder may merge similar frames)
    expect(results[0].transition!.frameCount).toBeGreaterThan(0);
    expect(results[0].transition!.durationMs).toBeGreaterThan(0);

    // Restore
    if (oldVal !== undefined) {
      process.env.WORKSHOT_SOCIAL_GIF = oldVal;
    } else {
      delete process.env.WORKSHOT_SOCIAL_GIF;
    }
  }, 60000);

  it("manifest includes transition block with SHA256", async () => {
    // GIF was created by previous test in the same jobDir
    const manifestPath = path.join(jobDir, "output", "social", "facebook", "manifest.json");
    if (!fs.existsSync(manifestPath)) return; // skip if previous test didn't run

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.transition).toBeDefined();
    expect(manifest.transition.path).toBe("transition.gif");
    expect(manifest.transition.sizeBytes).toBeGreaterThan(0);
    // frameCount is actual encoded GIF pages (encoder may merge similar frames)
    expect(manifest.transition.frameCount).toBeGreaterThan(0);
    expect(manifest.transition.durationMs).toBeGreaterThan(0);
    expect(manifest.transition.sha256).toMatch(/^[a-f0-9]{64}$/);

    // Verify SHA256 matches actual file
    const gifPath = path.join(jobDir, "output", "social", "facebook", "transition.gif");
    const actualHash = sha256(gifPath);
    expect(manifest.transition.sha256).toBe(actualHash);
  });

  it("image and caption still generated alongside GIF", async () => {
    const imagePath = path.join(jobDir, "output", "social", "facebook", "image.jpg");
    const captionPath = path.join(jobDir, "output", "social", "facebook", "caption.txt");
    expect(fs.existsSync(imagePath)).toBe(true);
    expect(fs.existsSync(captionPath)).toBe(true);
  });
});

// ---- CLI subprocess with env var ----

describe("crossfade CLI subprocess", () => {
  let jobDir: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "crossfade-cli",
        work: { service: "tree trim", notes: "CLI test" },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });
    // Run R1
    const r1 = await run(["run", jobDir]);
    expect(r1.code).toBe(0);
  }, 30000);

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("CLI without WORKSHOT_SOCIAL_GIF does not create GIF", async () => {
    const result = await run(
      ["social", jobDir, "--platform", "nextdoor"],
      { WORKSHOT_SOCIAL_GIF: "" }
    );
    expect(result.code).toBe(0);

    const gifPath = path.join(jobDir, "output", "social", "nextdoor", "transition.gif");
    expect(fs.existsSync(gifPath)).toBe(false);
  }, 30000);

  it("CLI with WORKSHOT_SOCIAL_GIF=1 creates GIF", async () => {
    const result = await run(
      ["social", jobDir, "--platform", "facebook"],
      { WORKSHOT_SOCIAL_GIF: "1" }
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("facebook");

    const gifPath = path.join(jobDir, "output", "social", "facebook", "transition.gif");
    expect(fs.existsSync(gifPath)).toBe(true);
    expect(fs.statSync(gifPath).size).toBeGreaterThan(0);
  }, 60000);
});

// ---- R3.1/R3.2/R3.3 non-regression ----

describe("R3.1-R3.3 non-regression with crossfade module loaded", () => {
  let jobDir: string;
  let r1ManifestHash: string;
  let r1CompositeHash: string;
  let r1CaptionHash: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "crossfade-regression",
        work: { service: "tree trim", notes: "Regression test" },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });
    // Run R1
    const r1 = await run(["run", jobDir]);
    expect(r1.code).toBe(0);

    // Record R1 hashes
    const outputDir = path.join(jobDir, "output");
    r1ManifestHash = sha256(path.join(outputDir, "manifest.json"));
    r1CompositeHash = sha256(path.join(outputDir, "before_after.png"));
    r1CaptionHash = sha256(path.join(outputDir, "caption.generic.txt"));
  }, 30000);

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("R1 outputs unchanged after social with GIF disabled", async () => {
    delete process.env.WORKSHOT_SOCIAL_GIF;
    await runSocial(jobDir, ["nextdoor"]);

    const outputDir = path.join(jobDir, "output");
    expect(sha256(path.join(outputDir, "manifest.json"))).toBe(r1ManifestHash);
    expect(sha256(path.join(outputDir, "before_after.png"))).toBe(r1CompositeHash);
    expect(sha256(path.join(outputDir, "caption.generic.txt"))).toBe(r1CaptionHash);
  });

  it("R1 outputs unchanged after social with GIF enabled", async () => {
    process.env.WORKSHOT_SOCIAL_GIF = "1";
    await runSocial(jobDir, ["facebook"]);

    const outputDir = path.join(jobDir, "output");
    expect(sha256(path.join(outputDir, "manifest.json"))).toBe(r1ManifestHash);
    expect(sha256(path.join(outputDir, "before_after.png"))).toBe(r1CompositeHash);
    expect(sha256(path.join(outputDir, "caption.generic.txt"))).toBe(r1CaptionHash);

    delete process.env.WORKSHOT_SOCIAL_GIF;
  }, 60000);
});
