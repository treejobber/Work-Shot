import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { ensureSchema } from "../../src/bot/db/schema";
import {
  getSession,
  upsertSession,
  clearSession,
  insertJob,
  updateJobStatus,
  updateJobMetadata,
  getJobById,
  logMessage,
} from "../../src/bot/db/queries";
import { isImageMimeType } from "../../src/bot/services/photoDownloader";

/**
 * These tests verify the state machine logic and DB interactions
 * that the handlers depend on. The handlers themselves call grammY
 * Context methods (ctx.reply, ctx.api.getFile) which require network
 * access, so we test the core logic via DB operations.
 */

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

describe("handler state machine logic", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    return () => db.close();
  });

  describe("before photo flow (idle → before_received)", () => {
    it("creates a job and sets session to before_received", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-100-1000",
        job_id: "tg-100-1000",
        service: "tree trim",
        notes: null,
        source_type: "telegram",
      });
      upsertSession(db, 100, "before_received", job.id, "tree trim", null);

      const session = getSession(db, 100);
      expect(session!.state).toBe("before_received");
      expect(session!.pending_job_id).toBe(job.id);
    });

    it("uses pending service/notes from a prior text message", () => {
      // User sent text first, then photo
      upsertSession(db, 100, "idle", null, "stump removal", "Big stump");

      const session = getSession(db, 100);
      expect(session!.pending_service).toBe("stump removal");
      expect(session!.pending_notes).toBe("Big stump");
    });
  });

  describe("after photo flow (before_received → processing → idle)", () => {
    it("transitions through processing to idle on success", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-200-2000",
        job_id: "tg-200-2000",
        source_type: "telegram",
      });
      upsertSession(db, 200, "before_received", job.id);

      // Simulate: after photo received, start processing
      upsertSession(db, 200, "processing", job.id);
      updateJobStatus(db, job.id, "processing");
      expect(getSession(db, 200)!.state).toBe("processing");
      expect(getJobById(db, job.id)!.status).toBe("processing");

      // Simulate: pipeline success
      updateJobStatus(db, job.id, "processed");
      clearSession(db, 200);
      expect(getSession(db, 200)!.state).toBe("idle");
      expect(getJobById(db, job.id)!.status).toBe("processed");
      expect(getJobById(db, job.id)!.run_at).not.toBeNull();
    });

    it("transitions to error and clears session on pipeline failure", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-300-3000",
        job_id: "tg-300-3000",
        source_type: "telegram",
      });
      upsertSession(db, 300, "processing", job.id);
      updateJobStatus(db, job.id, "processing");

      // Simulate: pipeline failure
      updateJobStatus(db, job.id, "error", "Compose failed");
      clearSession(db, 300);

      expect(getSession(db, 300)!.state).toBe("idle");
      expect(getJobById(db, job.id)!.status).toBe("error");
      expect(getJobById(db, job.id)!.error_msg).toBe("Compose failed");
    });
  });

  describe("cancel flow", () => {
    it("cancels a pending job and clears session", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-400-4000",
        job_id: "tg-400-4000",
        source_type: "telegram",
      });
      upsertSession(db, 400, "before_received", job.id);

      // Simulate /cancel
      updateJobStatus(db, job.id, "error", "Cancelled by user");
      clearSession(db, 400);

      expect(getSession(db, 400)!.state).toBe("idle");
      expect(getJobById(db, job.id)!.status).toBe("error");
      expect(getJobById(db, job.id)!.error_msg).toBe("Cancelled by user");
    });

    it("does nothing when already idle", () => {
      upsertSession(db, 500, "idle", null);
      // /cancel when idle: no-op on DB
      const session = getSession(db, 500);
      expect(session!.state).toBe("idle");
    });
  });

  describe("idempotency", () => {
    it("rejects duplicate inbound messages", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-600-6000",
        job_id: "tg-600-6000",
        source_type: "telegram",
      });
      const first = logMessage(db, {
        job_id: job.id,
        chat_id: 600,
        message_id: 42,
        direction: "inbound",
        role: "before_photo",
        file_id: "abc",
      });
      const second = logMessage(db, {
        job_id: job.id,
        chat_id: 600,
        message_id: 42,
        direction: "inbound",
        role: "before_photo",
        file_id: "abc",
      });

      expect(first).toBe(true);
      expect(second).toBe(false);
    });
  });

  describe("text during different states", () => {
    it("saves service/notes to session when idle", () => {
      upsertSession(db, 700, "idle", null, "stump grinding", "Near the fence");

      const session = getSession(db, 700);
      expect(session!.pending_service).toBe("stump grinding");
      expect(session!.pending_notes).toBe("Near the fence");
    });

    it("updates service/notes when in before_received state", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-800-8000",
        job_id: "tg-800-8000",
        source_type: "telegram",
      });
      upsertSession(db, 800, "before_received", job.id, "tree trim", null);

      // User sends text to update service
      upsertSession(db, 800, "before_received", job.id, "tree removal", "Big oak");

      const session = getSession(db, 800);
      expect(session!.state).toBe("before_received");
      expect(session!.pending_service).toBe("tree removal");
      expect(session!.pending_notes).toBe("Big oak");
    });
  });

  describe("metadata sync — text updates propagate to jobs row", () => {
    it("updates jobs row when text changes during before_received", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-1100-11000",
        job_id: "tg-1100-11000",
        service: "tree trim",
        notes: null,
        source_type: "telegram",
      });
      upsertSession(db, 1100, "before_received", job.id, "tree trim", null);

      // Simulate: user sends text to update service/notes
      upsertSession(db, 1100, "before_received", job.id, "stump removal", "Giant stump");
      updateJobMetadata(db, job.id, "stump removal", "Giant stump");

      // Both session and job row should be in sync
      const session = getSession(db, 1100);
      expect(session!.pending_service).toBe("stump removal");
      expect(session!.pending_notes).toBe("Giant stump");

      const updatedJob = getJobById(db, job.id)!;
      expect(updatedJob.service).toBe("stump removal");
      expect(updatedJob.notes).toBe("Giant stump");
    });

    it("jobs row stays at initial values if no text update occurs", () => {
      const job = insertJob(db, {
        job_dir: "/tmp/jobs/tg-1200-12000",
        job_id: "tg-1200-12000",
        service: "tree trim",
        notes: null,
        source_type: "telegram",
      });
      upsertSession(db, 1200, "before_received", job.id, "tree trim", null);

      // No text update — just proceed to after photo
      const unchangedJob = getJobById(db, job.id)!;
      expect(unchangedJob.service).toBe("tree trim");
      expect(unchangedJob.notes).toBeNull();
    });
  });

  describe("document photo support", () => {
    it("isImageMimeType accepts image/jpeg", () => {
      expect(isImageMimeType("image/jpeg")).toBe(true);
    });

    it("isImageMimeType accepts image/png", () => {
      expect(isImageMimeType("image/png")).toBe(true);
    });

    it("isImageMimeType accepts image/webp", () => {
      expect(isImageMimeType("image/webp")).toBe(true);
    });

    it("isImageMimeType rejects application/pdf", () => {
      expect(isImageMimeType("application/pdf")).toBe(false);
    });

    it("isImageMimeType rejects video/mp4", () => {
      expect(isImageMimeType("video/mp4")).toBe(false);
    });

    it("isImageMimeType rejects undefined", () => {
      expect(isImageMimeType(undefined)).toBe(false);
    });

    it("isImageMimeType is case-insensitive", () => {
      expect(isImageMimeType("IMAGE/JPEG")).toBe(true);
      expect(isImageMimeType("Image/Png")).toBe(true);
    });
  });

  describe("third photo after idle (new job)", () => {
    it("starts a new job cycle when a photo arrives while idle", () => {
      // Simulate: job 1 completed, session is idle
      const job1 = insertJob(db, {
        job_dir: "/tmp/jobs/tg-900-9000",
        job_id: "tg-900-9000",
        source_type: "telegram",
      });
      updateJobStatus(db, job1.id, "processed");
      clearSession(db, 900);

      // Third photo arrives — should start a new job
      const job2 = insertJob(db, {
        job_dir: "/tmp/jobs/tg-900-9001",
        job_id: "tg-900-9001",
        source_type: "telegram",
      });
      upsertSession(db, 900, "before_received", job2.id);

      const session = getSession(db, 900);
      expect(session!.state).toBe("before_received");
      expect(session!.pending_job_id).toBe(job2.id);
    });
  });
});
