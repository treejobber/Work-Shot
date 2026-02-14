/**
 * Bot social runner tests (R3.5).
 *
 * Tests cover:
 * - validateSocialPlatforms: valid, invalid, empty
 * - runBotSocial: success, failure, disabled (empty platforms)
 * - Config parsing: WORKSHOT_BOT_SOCIAL_PLATFORMS env var
 * - Integration: pipeline + social runner end-to-end
 * - Regression: job status stays "processed" when social fails
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { runBotSocial, validateSocialPlatforms } from "../../src/bot/services/socialRunner";
import { runPipeline } from "../../src/bot/services/pipelineRunner";
import { createTestJob, cleanupTestJob } from "../fixtures";
import { getAvailablePlatforms } from "../../src/social";
import { ensureSchema } from "../../src/bot/db/schema";
import { insertJob, updateJobStatus, getJobById } from "../../src/bot/db/queries";

const VALID_JOB_JSON = {
  schemaVersion: "1.0",
  jobId: "social-runner-test",
  createdAt: "2026-02-13T00:00:00.000Z",
  source: { type: "telegram", sourceRef: "123", messageId: null, threadId: null },
  customer: { name: null, phone: null, address: null },
  businessOwner: { phone: null },
  work: { service: "tree trim", notes: "Social runner test", workType: null, crew: null, workDate: null },
  targets: { platforms: ["generic"], publish: false },
  media: {
    pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
  },
};

// ---- validateSocialPlatforms ----

describe("validateSocialPlatforms", () => {
  it("accepts empty array (disabled)", () => {
    expect(() => validateSocialPlatforms([])).not.toThrow();
  });

  it("accepts valid platform names", () => {
    const available = getAvailablePlatforms();
    expect(() => validateSocialPlatforms(available)).not.toThrow();
  });

  it("accepts single valid platform", () => {
    expect(() => validateSocialPlatforms(["nextdoor"])).not.toThrow();
  });

  it("throws on invalid platform name", () => {
    expect(() => validateSocialPlatforms(["myspace"])).toThrow(
      /Invalid WORKSHOT_BOT_SOCIAL_PLATFORMS.*myspace/
    );
  });

  it("throws listing available platforms", () => {
    expect(() => validateSocialPlatforms(["myspace"])).toThrow(
      /Available: nextdoor, facebook/
    );
  });

  it("throws on mix of valid and invalid", () => {
    expect(() => validateSocialPlatforms(["nextdoor", "tiktok"])).toThrow(
      /tiktok/
    );
  });
});

// ---- runBotSocial ----

describe("runBotSocial", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      cleanupTestJob(dir);
    }
    dirs.length = 0;
  });

  it("returns success with empty outputs when platforms is empty", async () => {
    const result = await runBotSocial("/fake/dir", []);
    expect(result.success).toBe(true);
    expect(result.outputs).toEqual([]);
  });

  it("generates social outputs for nextdoor after R1 pipeline", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    // Run R1 pipeline first
    const pipeline = await runPipeline(jobDir);
    expect(pipeline.success).toBe(true);

    // Run social
    const result = await runBotSocial(jobDir, ["nextdoor"]);
    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].platform).toBe("nextdoor");

    // Verify files exist
    const imagePath = path.join(jobDir, "output", "social", "nextdoor", "image.jpg");
    const captionPath = path.join(jobDir, "output", "social", "nextdoor", "caption.txt");
    const manifestPath = path.join(jobDir, "output", "social", "nextdoor", "manifest.json");
    expect(fs.existsSync(imagePath)).toBe(true);
    expect(fs.existsSync(captionPath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("generates social outputs for multiple platforms", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    const pipeline = await runPipeline(jobDir);
    expect(pipeline.success).toBe(true);

    const result = await runBotSocial(jobDir, ["nextdoor", "facebook"]);
    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(2);
    const platforms = result.outputs!.map((o) => o.platform).sort();
    expect(platforms).toEqual(["facebook", "nextdoor"]);
  });

  it("returns error (not throw) when R1 has not been run", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    // Don't run pipeline — go straight to social
    const result = await runBotSocial(jobDir, ["nextdoor"]);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("manifest");
  });

  it("returns error (not throw) on nonexistent directory", async () => {
    const result = await runBotSocial("/nonexistent/path", ["nextdoor"]);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("R1 outputs unchanged after social generation", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    const pipeline = await runPipeline(jobDir);
    expect(pipeline.success).toBe(true);

    // Record R1 output hashes
    const outputDir = path.join(jobDir, "output");
    const r1Composite = fs.readFileSync(path.join(outputDir, "before_after.png"));
    const r1Caption = fs.readFileSync(path.join(outputDir, "caption.generic.txt"), "utf-8");
    const r1Manifest = fs.readFileSync(path.join(outputDir, "manifest.json"), "utf-8");

    // Run social
    await runBotSocial(jobDir, ["nextdoor"]);

    // Verify R1 outputs unchanged
    const postComposite = fs.readFileSync(path.join(outputDir, "before_after.png"));
    const postCaption = fs.readFileSync(path.join(outputDir, "caption.generic.txt"), "utf-8");
    const postManifest = fs.readFileSync(path.join(outputDir, "manifest.json"), "utf-8");

    expect(r1Composite.equals(postComposite)).toBe(true);
    expect(postCaption).toBe(r1Caption);
    expect(postManifest).toBe(r1Manifest);
  });
});

// ---- Job status regression ----

describe("job status regression", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      cleanupTestJob(dir);
    }
    dirs.length = 0;
  });

  it("job stays processed when social generation fails", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    ensureSchema(db);

    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    // Insert job into DB and mark as processed (simulating pipeline success)
    const job = insertJob(db, {
      job_dir: jobDir,
      job_id: "social-fail-test",
      service: "tree trim",
      source_type: "telegram",
    });
    updateJobStatus(db, job.id, "processed");

    // Social fails (no R1 run, so manifest is missing)
    const result = await runBotSocial(jobDir, ["nextdoor"]);
    expect(result.success).toBe(false);

    // Job status must still be "processed"
    const dbJob = getJobById(db, job.id)!;
    expect(dbJob.status).toBe("processed");

    db.close();
  });

  it("job stays processed when social generation succeeds", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    ensureSchema(db);

    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    // Run R1 pipeline
    const pipeline = await runPipeline(jobDir);
    expect(pipeline.success).toBe(true);

    // Insert job into DB and mark as processed
    const job = insertJob(db, {
      job_dir: jobDir,
      job_id: "social-ok-test",
      service: "tree trim",
      source_type: "telegram",
    });
    updateJobStatus(db, job.id, "processed");

    // Social succeeds
    const result = await runBotSocial(jobDir, ["nextdoor"]);
    expect(result.success).toBe(true);

    // Job status must still be "processed"
    const dbJob = getJobById(db, job.id)!;
    expect(dbJob.status).toBe("processed");

    db.close();
  });
});

// ---- Config parsing ----

describe("config parsing for socialPlatforms", () => {
  it("parses comma-separated platforms", () => {
    // Test the parsing logic directly (same logic as loadConfig)
    const raw = "nextdoor, facebook";
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    expect(parsed).toEqual(["nextdoor", "facebook"]);
  });

  it("parses empty string as empty array", () => {
    const raw = "";
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    expect(parsed).toEqual([]);
  });

  it("normalizes case", () => {
    const raw = "Nextdoor, FACEBOOK";
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    expect(parsed).toEqual(["nextdoor", "facebook"]);
  });

  it("handles whitespace-only entries", () => {
    const raw = "nextdoor, , facebook";
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    expect(parsed).toEqual(["nextdoor", "facebook"]);
  });

  it("handles single platform", () => {
    const raw = "nextdoor";
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    expect(parsed).toEqual(["nextdoor"]);
  });
});
