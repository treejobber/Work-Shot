import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { runPipeline } from "../../src/bot/services/pipelineRunner";
import { createTestJob, cleanupTestJob } from "../fixtures";

// Reusable job.json for tests
const VALID_JOB_JSON = {
  schemaVersion: "1.0",
  jobId: "pipeline-test",
  createdAt: "2026-02-11T00:00:00.000Z",
  source: { type: "telegram", sourceRef: "123", messageId: null, threadId: null },
  customer: { name: null, phone: null, address: null },
  businessOwner: { phone: null },
  work: { service: "tree trim", notes: "Pipeline runner test", workType: null, crew: null, workDate: null },
  targets: { platforms: ["generic"], publish: false },
  media: {
    pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
  },
};

describe("pipelineRunner", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      cleanupTestJob(dir);
    }
    dirs.length = 0;
  });

  it("produces all output files on happy path", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    const result = await runPipeline(jobDir);

    expect(result.success).toBe(true);
    expect(result.compositeOutputPath).toBeDefined();
    expect(result.captionOutputPath).toBeDefined();
    expect(result.manifestOutputPath).toBeDefined();
    expect(result.captionText).toBeDefined();

    // Verify files exist
    expect(fs.existsSync(result.compositeOutputPath!)).toBe(true);
    expect(fs.existsSync(result.captionOutputPath!)).toBe(true);
    expect(fs.existsSync(result.manifestOutputPath!)).toBe(true);

    // Verify manifest is valid JSON
    const manifest = JSON.parse(fs.readFileSync(result.manifestOutputPath!, "utf-8"));
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.jobId).toBe("pipeline-test");
  });

  it("returns error (not throw) when before image is missing", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON, skipBefore: true });
    dirs.push(jobDir);

    const result = await runPipeline(jobDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("before");
  });

  it("returns error (not throw) when after image is missing", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON, skipAfter: true });
    dirs.push(jobDir);

    const result = await runPipeline(jobDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("after");
  });

  it("returns error when job.json is missing", async () => {
    const jobDir = await createTestJob({ jobJson: null, meta: null });
    dirs.push(jobDir);

    const result = await runPipeline(jobDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("job.json");
  });

  it("returns error when job directory does not exist", async () => {
    const result = await runPipeline("/nonexistent/path/that/does/not/exist");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("supports stacked layout", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    const result = await runPipeline(jobDir, "stacked");

    expect(result.success).toBe(true);
    expect(fs.existsSync(result.compositeOutputPath!)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(result.manifestOutputPath!, "utf-8"));
    expect(manifest.layout).toBe("stacked");
  });

  it("caption text matches file contents", async () => {
    const jobDir = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDir);

    const result = await runPipeline(jobDir);

    expect(result.success).toBe(true);
    const fileCaption = fs.readFileSync(result.captionOutputPath!, "utf-8");
    expect(fileCaption).toBe(result.captionText);
  });

  // --- Parity test: CLI subprocess vs in-process pipelineRunner ---
  it("produces identical output to CLI subprocess (parity gate)", async () => {
    // Create two identical jobs
    const jobDirRunner = await createTestJob({ jobJson: VALID_JOB_JSON });
    const jobDirCli = await createTestJob({ jobJson: VALID_JOB_JSON });
    dirs.push(jobDirRunner, jobDirCli);

    // Run via pipelineRunner (in-process)
    const runnerResult = await runPipeline(jobDirRunner);
    expect(runnerResult.success).toBe(true);

    // Run via CLI subprocess
    const distIndex = path.resolve(__dirname, "../../dist/index.js");
    const nodePath = process.execPath; // Use the same node that's running tests
    execSync(`"${nodePath}" "${distIndex}" run "${jobDirCli}"`, {
      timeout: 30000,
    });

    // Compare output files
    const runnerOutput = path.join(jobDirRunner, "output");
    const cliOutput = path.join(jobDirCli, "output");

    // Both should have the same files
    const runnerFiles = fs.readdirSync(runnerOutput).sort();
    const cliFiles = fs.readdirSync(cliOutput).sort();
    expect(runnerFiles).toEqual(cliFiles);

    // Compare composite image (byte-for-byte)
    const runnerComposite = fs.readFileSync(
      path.join(runnerOutput, "before_after.png")
    );
    const cliComposite = fs.readFileSync(
      path.join(cliOutput, "before_after.png")
    );
    expect(runnerComposite.equals(cliComposite)).toBe(true);

    // Compare caption (byte-for-byte)
    const runnerCaption = fs.readFileSync(
      path.join(runnerOutput, "caption.generic.txt"),
      "utf-8"
    );
    const cliCaption = fs.readFileSync(
      path.join(cliOutput, "caption.generic.txt"),
      "utf-8"
    );
    expect(runnerCaption).toBe(cliCaption);

    // Compare manifest structure (skip runId and generatedAt which are timestamped)
    const runnerManifest = JSON.parse(
      fs.readFileSync(path.join(runnerOutput, "manifest.json"), "utf-8")
    );
    const cliManifest = JSON.parse(
      fs.readFileSync(path.join(cliOutput, "manifest.json"), "utf-8")
    );
    // These will differ due to timestamps/random runId
    delete runnerManifest.runId;
    delete runnerManifest.generatedAt;
    delete cliManifest.runId;
    delete cliManifest.generatedAt;
    // Paths will differ (different temp dirs), so compare structure only
    expect(runnerManifest.schemaVersion).toBe(cliManifest.schemaVersion);
    expect(runnerManifest.layout).toBe(cliManifest.layout);
    expect(runnerManifest.artifacts[0].width).toBe(cliManifest.artifacts[0].width);
    expect(runnerManifest.artifacts[0].height).toBe(cliManifest.artifacts[0].height);
    expect(runnerManifest.artifacts[0].sha256).toBe(cliManifest.artifacts[0].sha256);
    expect(runnerManifest.captions.generic.charCount).toBe(
      cliManifest.captions.generic.charCount
    );
  });
});
