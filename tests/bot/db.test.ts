import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { ensureSchema } from "../../src/bot/db/schema";
import {
  insertJob,
  getJobById,
  getJobByDir,
  updateJobStatus,
  updateJobMetadata,
  listJobs,
  getSession,
  upsertSession,
  clearSession,
  getStaleSessions,
  getSessionsByState,
  logMessage,
  getMessagesByJob,
} from "../../src/bot/db/queries";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

describe("schema", () => {
  it("creates all tables on first run", () => {
    const db = createTestDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("jobs");
    expect(names).toContain("chat_sessions");
    expect(names).toContain("telegram_messages");
    expect(names).toContain("schema_version");
    db.close();
  });

  it("is idempotent — running twice does not error", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    ensureSchema(db);
    ensureSchema(db); // Second call should not throw
    const version = db
      .prepare("SELECT MAX(version) as v FROM schema_version")
      .get() as { v: number };
    expect(version.v).toBe(1);
    db.close();
  });
});

describe("jobs CRUD", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    return () => db.close();
  });

  it("inserts and retrieves a job by ID", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/tg-123-1000",
      job_id: "tg-123-1000",
      service: "tree removal",
      notes: "Big oak in backyard",
      source_type: "telegram",
    });
    expect(job.id).toBeGreaterThan(0);
    expect(job.job_id).toBe("tg-123-1000");
    expect(job.service).toBe("tree removal");
    expect(job.status).toBe("pending");
    expect(job.source_type).toBe("telegram");

    const fetched = getJobById(db, job.id);
    expect(fetched).toBeDefined();
    expect(fetched!.job_dir).toBe("/tmp/jobs/tg-123-1000");
  });

  it("retrieves a job by directory path", () => {
    insertJob(db, {
      job_dir: "/tmp/jobs/tg-456-2000",
      job_id: "tg-456-2000",
      source_type: "telegram",
    });
    const fetched = getJobByDir(db, "/tmp/jobs/tg-456-2000");
    expect(fetched).toBeDefined();
    expect(fetched!.job_id).toBe("tg-456-2000");
  });

  it("enforces unique job_dir constraint", () => {
    insertJob(db, {
      job_dir: "/tmp/jobs/unique-test",
      job_id: "unique-test",
      source_type: "manual",
    });
    expect(() =>
      insertJob(db, {
        job_dir: "/tmp/jobs/unique-test",
        job_id: "unique-test-2",
        source_type: "manual",
      })
    ).toThrow(/UNIQUE constraint/);
  });

  it("updates job status", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/status-test",
      job_id: "status-test",
      source_type: "telegram",
    });
    updateJobStatus(db, job.id, "processing");
    expect(getJobById(db, job.id)!.status).toBe("processing");

    updateJobStatus(db, job.id, "processed");
    const updated = getJobById(db, job.id)!;
    expect(updated.status).toBe("processed");
    expect(updated.run_at).not.toBeNull();
  });

  it("updates job status with error message", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/error-test",
      job_id: "error-test",
      source_type: "telegram",
    });
    updateJobStatus(db, job.id, "error", "Pipeline crashed");
    const updated = getJobById(db, job.id)!;
    expect(updated.status).toBe("error");
    expect(updated.error_msg).toBe("Pipeline crashed");
  });

  it("lists jobs with optional filters", () => {
    insertJob(db, {
      job_dir: "/tmp/jobs/list-1",
      job_id: "list-1",
      source_type: "telegram",
    });
    insertJob(db, {
      job_dir: "/tmp/jobs/list-2",
      job_id: "list-2",
      source_type: "manual",
    });
    const job3 = insertJob(db, {
      job_dir: "/tmp/jobs/list-3",
      job_id: "list-3",
      source_type: "telegram",
    });
    updateJobStatus(db, job3.id, "processed");

    expect(listJobs(db)).toHaveLength(3);
    expect(listJobs(db, { source_type: "telegram" })).toHaveLength(2);
    expect(listJobs(db, { status: "processed" })).toHaveLength(1);
    expect(
      listJobs(db, { status: "pending", source_type: "telegram" })
    ).toHaveLength(1);
  });

  it("uses default values for optional fields", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/defaults",
      job_id: "defaults",
      source_type: "telegram",
    });
    expect(job.service).toBe("tree trim");
    expect(job.layout).toBe("side-by-side");
    expect(job.notes).toBeNull();
  });

  it("updates job metadata (service and notes)", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/meta-sync",
      job_id: "meta-sync",
      service: "tree trim",
      notes: null,
      source_type: "telegram",
    });
    expect(job.service).toBe("tree trim");
    expect(job.notes).toBeNull();

    updateJobMetadata(db, job.id, "stump removal", "Big stump near fence");
    const updated = getJobById(db, job.id)!;
    expect(updated.service).toBe("stump removal");
    expect(updated.notes).toBe("Big stump near fence");
  });

  it("updates job metadata to null notes", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/meta-null",
      job_id: "meta-null",
      service: "tree trim",
      notes: "old notes",
      source_type: "telegram",
    });
    updateJobMetadata(db, job.id, "hedge trim", null);
    const updated = getJobById(db, job.id)!;
    expect(updated.service).toBe("hedge trim");
    expect(updated.notes).toBeNull();
  });
});

describe("chat sessions", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    return () => db.close();
  });

  it("returns undefined for nonexistent session", () => {
    expect(getSession(db, 999)).toBeUndefined();
  });

  it("upserts a new session", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/session-1",
      job_id: "session-1",
      source_type: "telegram",
    });
    upsertSession(db, 12345, "before_received", job.id, "tree trim", null);
    const session = getSession(db, 12345);
    expect(session).toBeDefined();
    expect(session!.state).toBe("before_received");
    expect(session!.pending_job_id).toBe(job.id);
  });

  it("updates an existing session on conflict", () => {
    upsertSession(db, 12345, "idle", null);
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/session-2",
      job_id: "session-2",
      source_type: "telegram",
    });
    upsertSession(db, 12345, "before_received", job.id, "stump removal", "big stump");
    const session = getSession(db, 12345);
    expect(session!.state).toBe("before_received");
    expect(session!.pending_service).toBe("stump removal");
    expect(session!.pending_notes).toBe("big stump");
  });

  it("clears a session back to idle", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/session-clear",
      job_id: "session-clear",
      source_type: "telegram",
    });
    upsertSession(db, 12345, "processing", job.id);
    clearSession(db, 12345);
    const session = getSession(db, 12345);
    expect(session!.state).toBe("idle");
    expect(session!.pending_job_id).toBeNull();
  });

  it("finds sessions by state", () => {
    upsertSession(db, 111, "idle", null);
    upsertSession(db, 222, "before_received", null);
    upsertSession(db, 333, "before_received", null);
    upsertSession(db, 444, "processing", null);

    expect(getSessionsByState(db, "idle")).toHaveLength(1);
    expect(getSessionsByState(db, "before_received")).toHaveLength(2);
    expect(getSessionsByState(db, "processing")).toHaveLength(1);
  });

  it("finds stale sessions based on timeout", () => {
    // Insert a session and manually backdate its updated_at
    upsertSession(db, 111, "before_received", null);
    db.prepare(
      "UPDATE chat_sessions SET updated_at = datetime('now', '-60 minutes') WHERE chat_id = 111"
    ).run();

    upsertSession(db, 222, "before_received", null);
    // Chat 222 is fresh — just inserted

    const stale = getStaleSessions(db, 30);
    expect(stale).toHaveLength(1);
    expect(stale[0].chat_id).toBe(111);
  });
});

describe("telegram messages", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    return () => db.close();
  });

  it("logs a message and retrieves it by job", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/msg-1",
      job_id: "msg-1",
      source_type: "telegram",
    });
    const inserted = logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 100,
      direction: "inbound",
      role: "before_photo",
      file_id: "abc123",
    });
    expect(inserted).toBe(true);

    const messages = getMessagesByJob(db, job.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("before_photo");
    expect(messages[0].file_id).toBe("abc123");
  });

  it("rejects duplicate messages silently", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/msg-dup",
      job_id: "msg-dup",
      source_type: "telegram",
    });
    const first = logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 200,
      direction: "inbound",
      role: "before_photo",
    });
    const second = logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 200,
      direction: "inbound",
      role: "before_photo",
    });
    expect(first).toBe(true);
    expect(second).toBe(false);

    // Only one row
    const messages = getMessagesByJob(db, job.id);
    expect(messages).toHaveLength(1);
  });

  it("allows same message_id with different direction", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/msg-dir",
      job_id: "msg-dir",
      source_type: "telegram",
    });
    logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 300,
      direction: "inbound",
      role: "before_photo",
    });
    const outbound = logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 300,
      direction: "outbound",
      role: "system",
      text: "Got your photo!",
    });
    expect(outbound).toBe(true);

    const messages = getMessagesByJob(db, job.id);
    expect(messages).toHaveLength(2);
  });

  it("cascades delete when job is deleted", () => {
    const job = insertJob(db, {
      job_dir: "/tmp/jobs/msg-cascade",
      job_id: "msg-cascade",
      source_type: "telegram",
    });
    logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 400,
      direction: "inbound",
      role: "before_photo",
    });
    logMessage(db, {
      job_id: job.id,
      chat_id: 12345,
      message_id: 401,
      direction: "inbound",
      role: "after_photo",
    });
    expect(getMessagesByJob(db, job.id)).toHaveLength(2);

    // Delete the job
    db.prepare("DELETE FROM jobs WHERE id = ?").run(job.id);

    // Messages should be gone due to CASCADE
    expect(getMessagesByJob(db, job.id)).toHaveLength(0);
  });
});
