/**
 * Social media output layer tests (R3.1).
 *
 * Tests cover:
 * - Registry: known/unknown platform lookup
 * - Nextdoor adapter: spec correctness
 * - Composer: output dimensions, format, file size
 * - Caption: content, length limits
 * - Labels: SVG generation matches R1 pattern
 * - Integration: full runSocial() pipeline
 * - Social manifest: presence, schema, SHA256
 * - Path containment: rejects traversal in manifest paths
 * - CLI: parseArgs social command
 * - R1 non-regression: R1 outputs unchanged after social generation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import sharp from "sharp";
import { createTestJob, cleanupTestJob } from "../fixtures";
import { getAdapter, getAvailablePlatforms } from "../../src/social/registry";
import { composeSocialImage } from "../../src/social/composer";
import { generateSocialCaption } from "../../src/social/captionWriter";
import { runSocial } from "../../src/social";
import { createLabelSvg } from "../../src/lib/labels";
import { parseArgs } from "../../src/cli/parseArgs";

const NODE = process.execPath;
const CLI = path.resolve(__dirname, "..", "..", "dist", "index.js");

function run(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      NODE,
      [CLI, ...args],
      { cwd: path.resolve(__dirname, "..", "..") },
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

// ---- Registry ----

describe("platform registry", () => {
  it("returns nextdoor adapter", () => {
    const adapter = getAdapter("nextdoor");
    expect(adapter.spec.name).toBe("nextdoor");
  });

  it("throws on unknown platform", () => {
    expect(() => getAdapter("myspace")).toThrow(/Unknown platform "myspace"/);
  });

  it("returns facebook adapter", () => {
    const adapter = getAdapter("facebook");
    expect(adapter.spec.name).toBe("facebook");
  });

  it("lists available platforms", () => {
    const platforms = getAvailablePlatforms();
    expect(platforms).toContain("nextdoor");
    expect(platforms).toContain("facebook");
    expect(platforms.length).toBeGreaterThanOrEqual(2);
  });
});

// ---- Nextdoor Adapter ----

describe("nextdoor adapter spec", () => {
  const adapter = getAdapter("nextdoor");
  const spec = adapter.spec;

  it("image is 1200x675", () => {
    expect(spec.imageSpec.width).toBe(1200);
    expect(spec.imageSpec.height).toBe(675);
  });

  it("format is JPEG quality 90", () => {
    expect(spec.imageSpec.format).toBe("jpeg");
    expect(spec.imageSpec.quality).toBe(90);
  });

  it("max file size is 10MB", () => {
    expect(spec.imageSpec.maxFileSizeBytes).toBe(10 * 1024 * 1024);
  });

  it("layout is side-by-side", () => {
    expect(spec.layout).toBe("side-by-side");
  });

  it("caption max is 8192, no hashtags", () => {
    expect(spec.captionSpec.maxLength).toBe(8192);
    expect(spec.captionSpec.hashtags).toBe("none");
  });
});

// ---- Facebook Adapter ----

describe("facebook adapter spec", () => {
  const adapter = getAdapter("facebook");
  const spec = adapter.spec;

  it("image is 1080x1350", () => {
    expect(spec.imageSpec.width).toBe(1080);
    expect(spec.imageSpec.height).toBe(1350);
  });

  it("format is JPEG quality 90", () => {
    expect(spec.imageSpec.format).toBe("jpeg");
    expect(spec.imageSpec.quality).toBe(90);
  });

  it("max file size is 10MB", () => {
    expect(spec.imageSpec.maxFileSizeBytes).toBe(10 * 1024 * 1024);
  });

  it("layout is stacked", () => {
    expect(spec.layout).toBe("stacked");
  });

  it("caption max is 8192, no hashtags", () => {
    expect(spec.captionSpec.maxLength).toBe(8192);
    expect(spec.captionSpec.hashtags).toBe("none");
  });
});

// ---- Labels (shared module) ----

describe("shared label SVG", () => {
  it("produces valid SVG buffer", () => {
    const svg = createLabelSvg("BEFORE", 600, 675);
    expect(svg).toBeInstanceOf(Buffer);
    const text = svg.toString("utf-8");
    expect(text).toContain("<svg");
    expect(text).toContain("BEFORE");
  });

  it("AFTER label contains AFTER text", () => {
    const svg = createLabelSvg("AFTER", 600, 675);
    const text = svg.toString("utf-8");
    expect(text).toContain("AFTER");
  });
});

// ---- Composer ----

describe("social composer", () => {
  let jobDir: string;
  let beforePath: string;
  let afterPath: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "social-compose-test",
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

  it("produces 1200x675 JPEG for nextdoor", async () => {
    const adapter = getAdapter("nextdoor");
    const outputPath = path.join(jobDir, "test-nextdoor.jpg");
    const result = await composeSocialImage(
      beforePath,
      afterPath,
      outputPath,
      adapter.spec
    );

    expect(result.width).toBe(1200);
    expect(result.height).toBe(675);

    // Verify with sharp metadata
    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(675);
    expect(meta.format).toBe("jpeg");
  });

  it("output is under 10MB", async () => {
    const adapter = getAdapter("nextdoor");
    const outputPath = path.join(jobDir, "test-nextdoor-size.jpg");
    const result = await composeSocialImage(
      beforePath,
      afterPath,
      outputPath,
      adapter.spec
    );
    expect(result.sizeBytes).toBeLessThan(10 * 1024 * 1024);
  });

  it("produces 1080x1350 JPEG for facebook (stacked)", async () => {
    const adapter = getAdapter("facebook");
    const outputPath = path.join(jobDir, "test-facebook.jpg");
    const result = await composeSocialImage(
      beforePath,
      afterPath,
      outputPath,
      adapter.spec
    );

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);

    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(meta.format).toBe("jpeg");
  });

  it("facebook output is under 10MB", async () => {
    const adapter = getAdapter("facebook");
    const outputPath = path.join(jobDir, "test-facebook-size.jpg");
    const result = await composeSocialImage(
      beforePath,
      afterPath,
      outputPath,
      adapter.spec
    );
    expect(result.sizeBytes).toBeLessThan(10 * 1024 * 1024);
  });
});

// ---- Caption Writer ----

describe("social caption writer", () => {
  const facebookSpec = getAdapter("facebook").spec;
  const nextdoorSpec = getAdapter("nextdoor").spec;

  it("generates caption with service name", () => {
    const caption = generateSocialCaption({ service: "tree removal" }, nextdoorSpec);
    expect(caption).toContain("tree removal");
  });

  it("includes notes when provided", () => {
    const caption = generateSocialCaption(
      { service: "stump grinding", notes: "Big oak stump" },
      nextdoorSpec
    );
    expect(caption).toContain("Big oak stump");
  });

  it("uses default service when meta is null", () => {
    const caption = generateSocialCaption(null, nextdoorSpec);
    expect(caption).toContain("work");
  });

  it("is under platform max length", () => {
    const caption = generateSocialCaption(
      { service: "tree trim", notes: "A".repeat(10000) },
      nextdoorSpec
    );
    expect(caption.length).toBeLessThanOrEqual(nextdoorSpec.captionSpec.maxLength);
  });

  it("facebook caption is under 8192 chars", () => {
    const caption = generateSocialCaption(
      { service: "tree trim", notes: "A".repeat(10000) },
      facebookSpec
    );
    expect(caption.length).toBeLessThanOrEqual(facebookSpec.captionSpec.maxLength);
  });

  it("facebook caption contains service name", () => {
    const caption = generateSocialCaption({ service: "stump grinding" }, facebookSpec);
    expect(caption).toContain("stump grinding");
  });
});

// ---- Full Integration ----

describe("runSocial integration", () => {
  let jobDir: string;
  let r1ManifestHash: string;
  let r1CompositeHash: string;
  let r1CaptionHash: string;

  beforeAll(async () => {
    // Create job and run R1 pipeline first
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "social-integration",
        work: { service: "tree trim", notes: "Integration test" },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });

    // Run R1 pipeline via CLI
    const result = await run(["run", jobDir]);
    expect(result.code).toBe(0);

    // Record R1 output hashes before social generation
    const outputDir = path.join(jobDir, "output");
    r1ManifestHash = sha256(path.join(outputDir, "manifest.json"));
    r1CompositeHash = sha256(path.join(outputDir, "before_after.png"));
    r1CaptionHash = sha256(path.join(outputDir, "caption.generic.txt"));
  }, 30000);

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("produces nextdoor outputs", async () => {
    const results = await runSocial(jobDir, ["nextdoor"]);
    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe("nextdoor");
  });

  it("creates image.jpg in output/social/nextdoor/", () => {
    const imagePath = path.join(jobDir, "output", "social", "nextdoor", "image.jpg");
    expect(fs.existsSync(imagePath)).toBe(true);
  });

  it("creates caption.txt in output/social/nextdoor/", () => {
    const captionPath = path.join(jobDir, "output", "social", "nextdoor", "caption.txt");
    expect(fs.existsSync(captionPath)).toBe(true);
    const caption = fs.readFileSync(captionPath, "utf-8");
    expect(caption).toContain("tree trim");
    expect(caption.length).toBeLessThanOrEqual(8192);
  });

  it("nextdoor image is 1200x675 JPEG", async () => {
    const imagePath = path.join(jobDir, "output", "social", "nextdoor", "image.jpg");
    const meta = await sharp(imagePath).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(675);
    expect(meta.format).toBe("jpeg");
  });

  it("nextdoor image is under 10MB", () => {
    const imagePath = path.join(jobDir, "output", "social", "nextdoor", "image.jpg");
    const stat = fs.statSync(imagePath);
    expect(stat.size).toBeLessThan(10 * 1024 * 1024);
  });

  it("R1 manifest.json unchanged", () => {
    const currentHash = sha256(path.join(jobDir, "output", "manifest.json"));
    expect(currentHash).toBe(r1ManifestHash);
  });

  it("R1 before_after.png unchanged", () => {
    const currentHash = sha256(path.join(jobDir, "output", "before_after.png"));
    expect(currentHash).toBe(r1CompositeHash);
  });

  it("R1 caption.generic.txt unchanged", () => {
    const currentHash = sha256(path.join(jobDir, "output", "caption.generic.txt"));
    expect(currentHash).toBe(r1CaptionHash);
  });

  it("produces facebook outputs", async () => {
    const results = await runSocial(jobDir, ["facebook"]);
    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe("facebook");
  });

  it("creates image.jpg in output/social/facebook/", () => {
    const imagePath = path.join(jobDir, "output", "social", "facebook", "image.jpg");
    expect(fs.existsSync(imagePath)).toBe(true);
  });

  it("creates caption.txt in output/social/facebook/", () => {
    const captionPath = path.join(jobDir, "output", "social", "facebook", "caption.txt");
    expect(fs.existsSync(captionPath)).toBe(true);
    const caption = fs.readFileSync(captionPath, "utf-8");
    expect(caption).toContain("tree trim");
    expect(caption.length).toBeLessThanOrEqual(8192);
  });

  it("facebook image is 1080x1350 JPEG (stacked)", async () => {
    const imagePath = path.join(jobDir, "output", "social", "facebook", "image.jpg");
    const meta = await sharp(imagePath).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(meta.format).toBe("jpeg");
  });

  it("facebook image is under 10MB", () => {
    const imagePath = path.join(jobDir, "output", "social", "facebook", "image.jpg");
    const stat = fs.statSync(imagePath);
    expect(stat.size).toBeLessThan(10 * 1024 * 1024);
  });

  it("facebook manifest has correct schema", () => {
    const manifestPath = path.join(jobDir, "output", "social", "facebook", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.platform).toBe("facebook");
    expect(manifest.image.path).toBe("image.jpg");
    expect(manifest.image.width).toBe(1080);
    expect(manifest.image.height).toBe(1350);
    expect(manifest.image.format).toBe("jpeg");
    expect(manifest.image.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.caption.path).toBe("caption.txt");
    expect(manifest.caption.charCount).toBeGreaterThan(0);
  });

  it("facebook manifest SHA256 matches actual file", () => {
    const manifestPath = path.join(jobDir, "output", "social", "facebook", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const imagePath = path.join(jobDir, "output", "social", "facebook", "image.jpg");
    const actualHash = sha256(imagePath);
    expect(manifest.image.sha256).toBe(actualHash);
  });

  it("produces both platforms with --all equivalent", async () => {
    const results = await runSocial(jobDir, ["nextdoor", "facebook"]);
    expect(results).toHaveLength(2);
    const platforms = results.map(r => r.platform).sort();
    expect(platforms).toEqual(["facebook", "nextdoor"]);
  });

  it("throws when R1 has not been run", async () => {
    const emptyJob = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "no-r1",
        work: { service: "test" },
        media: { pairs: [{ pairId: "p", before: "before.png", after: "after.png", mediaType: "photo" }] },
      },
    });
    await expect(runSocial(emptyJob, ["nextdoor"])).rejects.toThrow(/Run 'workshot run' first/);
    cleanupTestJob(emptyJob);
  });

  it("creates manifest.json in output/social/nextdoor/", () => {
    const manifestPath = path.join(jobDir, "output", "social", "nextdoor", "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("social manifest has correct schema", () => {
    const manifestPath = path.join(jobDir, "output", "social", "nextdoor", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.platform).toBe("nextdoor");
    expect(manifest.generatedAt).toBeTruthy();
    expect(manifest.r1ManifestRef).toBeTruthy();
    expect(manifest.image.path).toBe("image.jpg");
    expect(manifest.image.width).toBe(1200);
    expect(manifest.image.height).toBe(675);
    expect(manifest.image.format).toBe("jpeg");
    expect(manifest.image.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.image.sizeBytes).toBeGreaterThan(0);
    expect(manifest.caption.path).toBe("caption.txt");
    expect(manifest.caption.charCount).toBeGreaterThan(0);
  });

  it("social manifest image SHA256 matches actual file", () => {
    const manifestPath = path.join(jobDir, "output", "social", "nextdoor", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const imagePath = path.join(jobDir, "output", "social", "nextdoor", "image.jpg");
    const actualHash = sha256(imagePath);
    expect(manifest.image.sha256).toBe(actualHash);
  });
});

// ---- Path Containment ----

describe("social path containment", () => {
  it("rejects traversal in manifest before path", async () => {
    // Create a job with R1 output, then tamper the manifest
    const jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "path-escape",
        work: { service: "test" },
        media: { pairs: [{ pairId: "p", before: "before.png", after: "after.png", mediaType: "photo" }] },
      },
    });

    // Run R1
    const r1 = await run(["run", jobDir]);
    expect(r1.code).toBe(0);

    // Tamper manifest with traversal path
    const manifestPath = path.join(jobDir, "output", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.inputs.mediaPairs[0].before = "../../../../etc/passwd";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(runSocial(jobDir, ["nextdoor"])).rejects.toThrow(/resolves outside/);
    cleanupTestJob(jobDir);
  }, 30000);

  it("rejects traversal in manifest after path", async () => {
    const jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "path-escape-2",
        work: { service: "test" },
        media: { pairs: [{ pairId: "p", before: "before.png", after: "after.png", mediaType: "photo" }] },
      },
    });

    const r1 = await run(["run", jobDir]);
    expect(r1.code).toBe(0);

    const manifestPath = path.join(jobDir, "output", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.inputs.mediaPairs[0].after = "../../../etc/shadow";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(runSocial(jobDir, ["nextdoor"])).rejects.toThrow(/resolves outside/);
    cleanupTestJob(jobDir);
  }, 30000);
});

// ---- CLI parseArgs ----

describe("social CLI parsing", () => {
  it("parses social command with single platform", () => {
    const result = parseArgs(["node", "index.js", "social", "jobs/test", "--platform", "nextdoor"]);
    expect(result.command).toBe("social");
    if (result.command === "social") {
      expect(result.platforms).toEqual(["nextdoor"]);
      expect(result.all).toBe(false);
    }
  });

  it("parses social command with multiple platforms", () => {
    const result = parseArgs(["node", "index.js", "social", "jobs/test", "--platform", "nextdoor", "--platform", "facebook"]);
    expect(result.command).toBe("social");
    if (result.command === "social") {
      expect(result.platforms).toEqual(["nextdoor", "facebook"]);
    }
  });

  it("parses social command with --all", () => {
    const result = parseArgs(["node", "index.js", "social", "jobs/test", "--all"]);
    expect(result.command).toBe("social");
    if (result.command === "social") {
      expect(result.all).toBe(true);
    }
  });

  it("resolves job dir to absolute path", () => {
    const result = parseArgs(["node", "index.js", "social", "jobs/test", "--all"]);
    if (result.command === "social") {
      expect(path.isAbsolute(result.jobDir)).toBe(true);
    }
  });
});

// ---- CLI Integration (subprocess) ----

describe("social CLI subprocess", () => {
  let jobDir: string;

  beforeAll(async () => {
    jobDir = await createTestJob({
      jobJson: {
        schemaVersion: "1.0",
        jobId: "cli-social-test",
        work: { service: "tree trim", notes: "CLI test" },
        media: {
          pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
        },
      },
    });
    // Run R1 first
    const r1 = await run(["run", jobDir]);
    expect(r1.code).toBe(0);
  }, 30000);

  afterAll(() => {
    cleanupTestJob(jobDir);
  });

  it("workshot social --platform nextdoor succeeds", async () => {
    const result = await run(["social", jobDir, "--platform", "nextdoor"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nextdoor");
  }, 30000);

  it("workshot social --platform facebook succeeds", async () => {
    const result = await run(["social", jobDir, "--platform", "facebook"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("facebook");
  }, 30000);

  it("workshot social --all produces both platforms", async () => {
    const result = await run(["social", jobDir, "--all"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nextdoor");
    expect(result.stdout).toContain("facebook");
  }, 30000);

  it("workshot social without --platform or --all fails", async () => {
    const result = await run(["social", jobDir]);
    expect(result.code).not.toBe(0);
  });
});
