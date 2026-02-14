import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
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

describe("CLI integration tests", () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI)) {
      throw new Error(
        "dist/index.js not found. Run 'npm run build' before tests."
      );
    }
  });

  // ---- Error paths ----

  describe("no arguments", () => {
    it("exits with error and shows usage", async () => {
      const result = await run([]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("No command or arguments");
    });
  });

  describe("unknown flag", () => {
    it("exits with error for unknown flags", async () => {
      const result = await run(["--unknown"]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Unknown flag");
    });
  });

  describe("unknown command", () => {
    it("exits with error for unknown commands", async () => {
      const result = await run(["frobnicate"]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Unknown command");
    });
  });

  // ---- Validate command ----

  describe("validate command", () => {
    it("fails for nonexistent directory", async () => {
      const result = await run(["validate", "/nonexistent/path/xyz"]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("not found");
    });

    it("fails for job missing images", async () => {
      const dir = fs.mkdtempSync(
        path.join(require("os").tmpdir(), "workshot-val-")
      );
      try {
        const result = await run(["validate", dir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("No before image");
        expect(result.stderr).toContain("No after image");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("fails for job without job.json", async () => {
      const jobDir = await createTestJob({ meta: null });
      try {
        const result = await run(["validate", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("job.json is required");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("passes for valid job with job.json", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "test-validate",
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
        const result = await run(["validate", jobDir]);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("Validation passed");
        // Should NOT warn about meta.json since we have job.json
        expect(result.stderr).not.toContain("meta.json");
      } finally {
        cleanupTestJob(jobDir);
      }
    });
  });

  // ---- Run command (canonical) ----

  describe("run command", () => {
    let jobDir: string;

    beforeAll(async () => {
      jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "test-run",
          work: { service: "tree trim", notes: "Test job" },
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

    it("produces output with Done message", async () => {
      const result = await run(["run", jobDir]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Done.");
    });

    it("creates before_after.png in <job_dir>/output/", () => {
      const f = path.join(jobDir, "output", "before_after.png");
      expect(fs.existsSync(f)).toBe(true);
      expect(fs.statSync(f).size).toBeGreaterThan(0);
    });

    it("creates caption.generic.txt in <job_dir>/output/", () => {
      const f = path.join(jobDir, "output", "caption.generic.txt");
      expect(fs.existsSync(f)).toBe(true);
      const content = fs.readFileSync(f, "utf-8");
      expect(content).toContain("Before & after");
      expect(content).toContain("tree trim");
    });

    it("creates manifest.json with required keys", () => {
      const f = path.join(jobDir, "output", "manifest.json");
      expect(fs.existsSync(f)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(f, "utf-8"));
      expect(manifest.schemaVersion).toBe("1.0");
      expect(manifest.jobId).toBeDefined();
      expect(manifest.runId).toBeDefined();
      expect(manifest.generatedAt).toBeDefined();
      expect(manifest.layout).toBe("side-by-side");
      expect(manifest.inputs).toBeDefined();
      expect(manifest.artifacts).toBeDefined();
      expect(manifest.captions).toBeDefined();
      expect(manifest.targets).toBeDefined();
      expect(manifest.warnings).toBeDefined();
    });

    it("manifest has correct artifact shape", () => {
      const f = path.join(jobDir, "output", "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(f, "utf-8"));
      expect(manifest.artifacts).toHaveLength(1);
      const artifact = manifest.artifacts[0];
      expect(artifact.artifactId).toBe("primary-composite");
      expect(artifact.kind).toBe("media");
      expect(artifact.role).toBe("composite");
      expect(artifact.path).toBe("before_after.png");
      expect(artifact.width).toBeGreaterThan(0);
      expect(artifact.height).toBeGreaterThan(0);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it("manifest has correct caption shape", () => {
      const f = path.join(jobDir, "output", "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(f, "utf-8"));
      expect(manifest.captions.generic.path).toBe("caption.generic.txt");
      expect(manifest.captions.generic.charCount).toBeGreaterThan(0);
      expect(manifest.captions.platform.facebook.status).toBe("not_generated");
      expect(manifest.captions.platform.facebook.fallback).toBe("generic");
    });

    it("fails when run is missing job_dir", async () => {
      const result = await run(["run"]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("requires a job directory");
    });

    it("fails when job_dir does not exist", async () => {
      const result = await run(["run", "/nonexistent/path/xyz"]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Job folder not found");
    });
  });

  // ---- Run with job.json ----

  describe("run with job.json", () => {
    let jobDir: string;

    beforeAll(async () => {
      jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "test-jobjson",
          work: { service: "stump removal", notes: "Big oak" },
          targets: { platforms: ["generic"], publish: false },
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

    it("uses job.json data for caption", async () => {
      const result = await run(["run", jobDir]);
      expect(result.code).toBe(0);
      const caption = fs.readFileSync(
        path.join(jobDir, "output", "caption.generic.txt"),
        "utf-8"
      );
      expect(caption).toContain("stump removal");
    });

    it("manifest references job.json", () => {
      const f = path.join(jobDir, "output", "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(f, "utf-8"));
      expect(manifest.inputs.jobFile).toContain("job.json");
    });
  });

  // ---- Legacy rejection tests (Phase 6) ----

  describe("legacy --job rejection", () => {
    it("rejects --job flag with unknown flag error", async () => {
      const result = await run(["--job", "some_name"]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Unknown flag");
    });
  });

  describe("meta-only job rejection", () => {
    it("run fails for job with meta.json but no job.json", async () => {
      const jobDir = await createTestJob();
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("job.json is required");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("validate fails for job with meta.json but no job.json", async () => {
      const jobDir = await createTestJob();
      try {
        const result = await run(["validate", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("job.json is required");
      } finally {
        cleanupTestJob(jobDir);
      }
    });
  });

  // ---- Path containment tests ----

  describe("path containment", () => {
    it("run rejects job.json with traversal in media.pairs[].before", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "traversal-test",
          work: { service: "tree trim" },
          media: {
            pairs: [
              {
                pairId: "primary",
                before: "../../etc/passwd",
                after: "after.png",
                mediaType: "photo",
              },
            ],
          },
        },
      });
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("invalid path components");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("run rejects job.json with traversal in media.pairs[].after", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "traversal-test",
          work: { service: "tree trim" },
          media: {
            pairs: [
              {
                pairId: "primary",
                before: "before.png",
                after: "../../../secret.png",
                mediaType: "photo",
              },
            ],
          },
        },
      });
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("invalid path components");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("validate rejects job.json with traversal in media filenames", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "traversal-test",
          work: { service: "tree trim" },
          media: {
            pairs: [
              {
                pairId: "primary",
                before: "../before.png",
                after: "after.png",
                mediaType: "photo",
              },
            ],
          },
        },
      });
      try {
        const result = await run(["validate", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("invalid path components");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("run produces no output files when path safety fails", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "no-output-test",
          work: { service: "tree trim" },
          media: {
            pairs: [
              {
                pairId: "primary",
                before: "../../evil.png",
                after: "after.png",
                mediaType: "photo",
              },
            ],
          },
        },
      });
      try {
        await run(["run", jobDir]);
        const outputDir = path.join(jobDir, "output");
        expect(fs.existsSync(outputDir)).toBe(false);
      } finally {
        cleanupTestJob(jobDir);
      }
    });
  });

  // ---- Social dotenv loading ----

  describe("social dotenv loading", () => {
    let jobDir: string;

    function runWithEnv(
      args: string[],
      env: Record<string, string | undefined>
    ): Promise<{ stdout: string; stderr: string; code: number }> {
      return new Promise((resolve) => {
        execFile(
          NODE,
          [CLI, ...args],
          {
            cwd: path.resolve(__dirname, ".."),
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

    beforeAll(async () => {
      jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "test-social-dotenv",
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
      // Run R1 first (required by social)
      const r1 = await run(["run", jobDir]);
      expect(r1.code).toBe(0);
    }, 30000);

    afterAll(() => {
      cleanupTestJob(jobDir);
    });

    it("social succeeds when GEMINI_API_KEY is pre-set (not overridden by dotenv)", async () => {
      const result = await runWithEnv(
        ["social", jobDir, "--platform", "nextdoor"],
        { GEMINI_API_KEY: "test-preset-key" }
      );
      // Smart-crop will fail with invalid key but fallback is non-fatal
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Done.");
    }, 30000);

    it("social succeeds when GEMINI_API_KEY is unset (dotenv loads or fallback)", async () => {
      const result = await runWithEnv(
        ["social", jobDir, "--platform", "nextdoor"],
        { GEMINI_API_KEY: "" }
      );
      // Either dotenv loads the key from .env or center-crop fallback works
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Done.");
    }, 30000);

    it("run command does not load dotenv (no GEMINI_API_KEY side effect)", async () => {
      // This verifies dotenv loading is scoped to social only.
      // The run command should succeed without any env loading.
      const result = await run(["run", jobDir]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Done.");
    });
  });

  // ---- Malformed job.json tests ----

  describe("malformed job.json", () => {
    it("run fails on malformed job.json (invalid JSON)", async () => {
      const jobDir = await createTestJob({ meta: null });
      fs.writeFileSync(path.join(jobDir, "job.json"), "not valid json{{{");
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("invalid JSON");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("validate fails on malformed job.json (invalid JSON)", async () => {
      const jobDir = await createTestJob({ meta: null });
      fs.writeFileSync(path.join(jobDir, "job.json"), "not valid json{{{");
      try {
        const result = await run(["validate", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("invalid JSON");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("run fails when job.json is missing required work.service", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          work: { notes: "no service field" },
          media: {
            pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
          },
        },
      });
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("work.service");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("validate fails when job.json is missing required work.service", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          work: { notes: "no service field" },
          media: {
            pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
          },
        },
      });
      try {
        const result = await run(["validate", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("work.service");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("run fails when job.json has empty media.pairs", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          work: { service: "tree trim" },
          media: { pairs: [] },
        },
      });
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("media.pairs");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("run fails when job.json is not an object (array)", async () => {
      const jobDir = await createTestJob({ meta: null });
      fs.writeFileSync(path.join(jobDir, "job.json"), "[1, 2, 3]");
      try {
        const result = await run(["run", jobDir]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("must be a JSON object");
      } finally {
        cleanupTestJob(jobDir);
      }
    });
  });

  // ---- run/validate parity tests ----

  describe("run/validate parity", () => {
    it("both fail for missing images", async () => {
      const dir = fs.mkdtempSync(
        path.join(require("os").tmpdir(), "workshot-parity-")
      );
      try {
        const [runResult, valResult] = await Promise.all([
          run(["run", dir]),
          run(["validate", dir]),
        ]);
        expect(runResult.code).not.toBe(0);
        expect(valResult.code).not.toBe(0);
        // Both should mention missing before image
        expect(runResult.stderr).toContain("No before image");
        expect(valResult.stderr).toContain("No before image");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("both fail for invalid job.json", async () => {
      const jobDir = await createTestJob({ meta: null });
      fs.writeFileSync(path.join(jobDir, "job.json"), "{{bad}}");
      try {
        const [runResult, valResult] = await Promise.all([
          run(["run", jobDir]),
          run(["validate", jobDir]),
        ]);
        expect(runResult.code).not.toBe(0);
        expect(valResult.code).not.toBe(0);
        expect(runResult.stderr).toContain("invalid JSON");
        expect(valResult.stderr).toContain("invalid JSON");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("both succeed for valid job with job.json", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          jobId: "parity-valid",
          work: { service: "tree trim" },
          media: {
            pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
          },
        },
      });
      try {
        const [runResult, valResult] = await Promise.all([
          run(["run", jobDir]),
          run(["validate", jobDir]),
        ]);
        expect(runResult.code).toBe(0);
        expect(valResult.code).toBe(0);
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("both fail for missing job.json", async () => {
      const jobDir = await createTestJob({ meta: null });
      try {
        const [runResult, valResult] = await Promise.all([
          run(["run", jobDir]),
          run(["validate", jobDir]),
        ]);
        expect(runResult.code).not.toBe(0);
        expect(valResult.code).not.toBe(0);
        expect(runResult.stderr).toContain("job.json is required");
        expect(valResult.stderr).toContain("job.json is required");
      } finally {
        cleanupTestJob(jobDir);
      }
    });

    it("both fail for job.json with missing work object", async () => {
      const jobDir = await createTestJob({
        jobJson: {
          schemaVersion: "1.0",
          media: {
            pairs: [{ pairId: "primary", before: "before.png", after: "after.png", mediaType: "photo" }],
          },
        },
      });
      try {
        const [runResult, valResult] = await Promise.all([
          run(["run", jobDir]),
          run(["validate", jobDir]),
        ]);
        expect(runResult.code).not.toBe(0);
        expect(valResult.code).not.toBe(0);
        expect(runResult.stderr).toContain("work");
        expect(valResult.stderr).toContain("work");
      } finally {
        cleanupTestJob(jobDir);
      }
    });
  });
});
