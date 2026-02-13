import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createJobFolder, writeJobJson } from "../../src/bot/services/jobCreator";
import { validateJob } from "../../src/pipeline/ingest";
import sharp from "sharp";

describe("jobCreator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workshot-jc-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("createJobFolder", () => {
    it("creates a folder with the correct naming pattern", () => {
      const result = createJobFolder({
        jobsDir: tempDir,
        chatId: 12345,
        service: "tree trim",
        notes: null,
      });

      expect(result.jobId).toMatch(/^tg-12345-\d+$/);
      expect(result.jobDir).toBe(path.join(tempDir, result.jobId));
      expect(fs.existsSync(result.jobDir)).toBe(true);
      expect(fs.statSync(result.jobDir).isDirectory()).toBe(true);
    });

    it("creates unique folder names for different chat IDs", () => {
      const result1 = createJobFolder({
        jobsDir: tempDir,
        chatId: 12345,
        service: "tree trim",
        notes: null,
      });
      const result2 = createJobFolder({
        jobsDir: tempDir,
        chatId: 67890,
        service: "tree trim",
        notes: null,
      });

      expect(result1.jobDir).not.toBe(result2.jobDir);
      expect(result1.jobId).toContain("12345");
      expect(result2.jobId).toContain("67890");
    });

    it("creates parent directories if jobsDir does not exist", () => {
      const nestedDir = path.join(tempDir, "nested", "jobs");
      const result = createJobFolder({
        jobsDir: nestedDir,
        chatId: 999,
        service: "tree trim",
        notes: null,
      });

      expect(fs.existsSync(result.jobDir)).toBe(true);
    });
  });

  describe("writeJobJson", () => {
    it("writes a valid R1-compatible job.json", () => {
      const jobDir = path.join(tempDir, "test-job");
      fs.mkdirSync(jobDir);

      writeJobJson({
        jobDir,
        jobId: "tg-123-1000",
        service: "stump removal",
        notes: "Big stump in front yard",
        beforeFilename: "before.jpg",
        afterFilename: "after.jpg",
        chatId: 123,
      });

      const jsonPath = path.join(jobDir, "job.json");
      expect(fs.existsSync(jsonPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      expect(parsed.schemaVersion).toBe("1.0");
      expect(parsed.jobId).toBe("tg-123-1000");
      expect(parsed.source.type).toBe("telegram");
      expect(parsed.source.sourceRef).toBe("123");
      expect(parsed.work.service).toBe("stump removal");
      expect(parsed.work.notes).toBe("Big stump in front yard");
      expect(parsed.media.pairs).toHaveLength(1);
      expect(parsed.media.pairs[0].before).toBe("before.jpg");
      expect(parsed.media.pairs[0].after).toBe("after.jpg");
    });

    it("handles null notes", () => {
      const jobDir = path.join(tempDir, "no-notes");
      fs.mkdirSync(jobDir);

      writeJobJson({
        jobDir,
        jobId: "tg-456-2000",
        service: "tree trim",
        notes: null,
        beforeFilename: "before.png",
        afterFilename: "after.png",
        chatId: 456,
      });

      const parsed = JSON.parse(
        fs.readFileSync(path.join(jobDir, "job.json"), "utf-8")
      );
      expect(parsed.work.notes).toBeNull();
    });

    it("creates a job folder that passes R1 validateJob (with images present)", async () => {
      const jobDir = path.join(tempDir, "validate-test");
      fs.mkdirSync(jobDir);

      // Create synthetic images
      const img = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).png().toBuffer();
      fs.writeFileSync(path.join(jobDir, "before.png"), img);
      fs.writeFileSync(path.join(jobDir, "after.png"), img);

      writeJobJson({
        jobDir,
        jobId: "tg-789-3000",
        service: "tree trim",
        notes: "Test",
        beforeFilename: "before.png",
        afterFilename: "after.png",
        chatId: 789,
      });

      // R1's validateJob should pass
      const result = validateJob(jobDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
