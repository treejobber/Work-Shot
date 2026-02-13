import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import Database from "better-sqlite3";
import { ensureSchema } from "../../src/bot/db/schema";
import {
  insertJob,
  getJobById,
  updateJobStatus,
  upsertSession,
  getSession,
} from "../../src/bot/db/queries";
import { reconcileOnStartup } from "../../src/bot/sessionTimeout";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

describe("reconcileOnStartup", () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    db = createTestDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workshot-recon-"));
    return () => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    };
  });

  it("marks stuck processing job as processed when output exists", () => {
    const jobDir = path.join(tempDir, "job1");
    fs.mkdirSync(path.join(jobDir, "output"), { recursive: true });
    fs.writeFileSync(
      path.join(jobDir, "output", "before_after.png"),
      "fake image"
    );

    const job = insertJob(db, {
      job_dir: jobDir,
      job_id: "recon-1",
      source_type: "telegram",
    });
    updateJobStatus(db, job.id, "processing");
    upsertSession(db, 100, "processing", job.id);

    reconcileOnStartup(db);

    expect(getJobById(db, job.id)!.status).toBe("processed");
    expect(getSession(db, 100)!.state).toBe("idle");
  });

  it("marks stuck processing job as error when no output exists", () => {
    const jobDir = path.join(tempDir, "job2");
    fs.mkdirSync(jobDir, { recursive: true });

    const job = insertJob(db, {
      job_dir: jobDir,
      job_id: "recon-2",
      source_type: "telegram",
    });
    updateJobStatus(db, job.id, "processing");
    upsertSession(db, 200, "processing", job.id);

    reconcileOnStartup(db);

    expect(getJobById(db, job.id)!.status).toBe("error");
    expect(getJobById(db, job.id)!.error_msg).toContain("restarted");
    expect(getSession(db, 200)!.state).toBe("idle");
  });

  it("clears stale before_received sessions", () => {
    const jobDir = path.join(tempDir, "job3");
    fs.mkdirSync(jobDir, { recursive: true });

    const job = insertJob(db, {
      job_dir: jobDir,
      job_id: "recon-3",
      source_type: "telegram",
    });
    upsertSession(db, 300, "before_received", job.id);

    reconcileOnStartup(db);

    expect(getJobById(db, job.id)!.status).toBe("error");
    expect(getJobById(db, job.id)!.error_msg).toContain("expired");
    expect(getSession(db, 300)!.state).toBe("idle");
  });

  it("does nothing when no stuck sessions exist", () => {
    upsertSession(db, 400, "idle", null);

    // Should not throw
    reconcileOnStartup(db);

    expect(getSession(db, 400)!.state).toBe("idle");
  });

  it("handles multiple stuck sessions at once", () => {
    const jobDir1 = path.join(tempDir, "job4");
    const jobDir2 = path.join(tempDir, "job5");
    fs.mkdirSync(jobDir1, { recursive: true });
    fs.mkdirSync(jobDir2, { recursive: true });

    const job1 = insertJob(db, {
      job_dir: jobDir1,
      job_id: "recon-4",
      source_type: "telegram",
    });
    const job2 = insertJob(db, {
      job_dir: jobDir2,
      job_id: "recon-5",
      source_type: "telegram",
    });

    updateJobStatus(db, job1.id, "processing");
    upsertSession(db, 500, "processing", job1.id);
    upsertSession(db, 600, "before_received", job2.id);

    reconcileOnStartup(db);

    expect(getSession(db, 500)!.state).toBe("idle");
    expect(getSession(db, 600)!.state).toBe("idle");
    expect(getJobById(db, job1.id)!.status).toBe("error");
    expect(getJobById(db, job2.id)!.status).toBe("error");
  });
});
