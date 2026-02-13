import type Database from "better-sqlite3";
import type {
  JobRow,
  NewJob,
  JobStatus,
  ChatSessionRow,
  ChatState,
  NewTelegramMessage,
  TelegramMessageRow,
} from "../types";

// ============================================================
// Jobs
// ============================================================

export function insertJob(db: Database.Database, job: NewJob): JobRow {
  const stmt = db.prepare(`
    INSERT INTO jobs (job_dir, job_id, service, notes, layout, source_type)
    VALUES (@job_dir, @job_id, @service, @notes, @layout, @source_type)
  `);
  const result = stmt.run({
    job_dir: job.job_dir,
    job_id: job.job_id,
    service: job.service ?? "tree trim",
    notes: job.notes ?? null,
    layout: job.layout ?? "side-by-side",
    source_type: job.source_type,
  });
  return getJobById(db, result.lastInsertRowid as number)!;
}

export function getJobById(
  db: Database.Database,
  id: number
): JobRow | undefined {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
    | JobRow
    | undefined;
}

export function getJobByDir(
  db: Database.Database,
  jobDir: string
): JobRow | undefined {
  return db.prepare("SELECT * FROM jobs WHERE job_dir = ?").get(jobDir) as
    | JobRow
    | undefined;
}

export function updateJobStatus(
  db: Database.Database,
  id: number,
  status: JobStatus,
  errorMsg?: string | null
): void {
  if (status === "processed") {
    db.prepare(
      `UPDATE jobs SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP, run_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(status, errorMsg ?? null, id);
  } else {
    db.prepare(
      `UPDATE jobs SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(status, errorMsg ?? null, id);
  }
}

export function updateJobMetadata(
  db: Database.Database,
  id: number,
  service: string,
  notes: string | null
): void {
  db.prepare(
    `UPDATE jobs SET service = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(service, notes, id);
}

export function listJobs(
  db: Database.Database,
  filters?: { status?: JobStatus; source_type?: string }
): JobRow[] {
  let sql = "SELECT * FROM jobs";
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters?.status) {
    conditions.push("status = @status");
    params.status = filters.status;
  }
  if (filters?.source_type) {
    conditions.push("source_type = @source_type");
    params.source_type = filters.source_type;
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC";

  return db.prepare(sql).all(params) as JobRow[];
}

// ============================================================
// Chat Sessions
// ============================================================

export function getSession(
  db: Database.Database,
  chatId: number
): ChatSessionRow | undefined {
  return db
    .prepare("SELECT * FROM chat_sessions WHERE chat_id = ?")
    .get(chatId) as ChatSessionRow | undefined;
}

export function upsertSession(
  db: Database.Database,
  chatId: number,
  state: ChatState,
  pendingJobId: number | null,
  pendingService?: string,
  pendingNotes?: string | null
): void {
  db.prepare(
    `INSERT INTO chat_sessions (chat_id, state, pending_job_id, pending_service, pending_notes, updated_at)
     VALUES (@chat_id, @state, @pending_job_id, @pending_service, @pending_notes, CURRENT_TIMESTAMP)
     ON CONFLICT(chat_id) DO UPDATE SET
       state = @state,
       pending_job_id = @pending_job_id,
       pending_service = @pending_service,
       pending_notes = @pending_notes,
       updated_at = CURRENT_TIMESTAMP`
  ).run({
    chat_id: chatId,
    state,
    pending_job_id: pendingJobId,
    pending_service: pendingService ?? "tree trim",
    pending_notes: pendingNotes ?? null,
  });
}

export function clearSession(db: Database.Database, chatId: number): void {
  upsertSession(db, chatId, "idle", null, "tree trim", null);
}

export function getStaleSessions(
  db: Database.Database,
  timeoutMinutes: number
): ChatSessionRow[] {
  return db
    .prepare(
      `SELECT * FROM chat_sessions
       WHERE state != 'idle'
       AND updated_at < datetime('now', '-' || ? || ' minutes')`
    )
    .all(timeoutMinutes) as ChatSessionRow[];
}

export function getSessionsByState(
  db: Database.Database,
  state: ChatState
): ChatSessionRow[] {
  return db
    .prepare("SELECT * FROM chat_sessions WHERE state = ?")
    .all(state) as ChatSessionRow[];
}

// ============================================================
// Telegram Messages
// ============================================================

/**
 * Logs a Telegram message. Returns true if inserted, false if duplicate
 * (based on UNIQUE(chat_id, message_id, direction) constraint).
 */
export function logMessage(
  db: Database.Database,
  msg: NewTelegramMessage
): boolean {
  try {
    db.prepare(
      `INSERT INTO telegram_messages (job_id, chat_id, message_id, direction, role, file_id, text)
       VALUES (@job_id, @chat_id, @message_id, @direction, @role, @file_id, @text)`
    ).run({
      job_id: msg.job_id,
      chat_id: msg.chat_id,
      message_id: msg.message_id,
      direction: msg.direction,
      role: msg.role,
      file_id: msg.file_id ?? null,
      text: msg.text ?? null,
    });
    return true;
  } catch (err: unknown) {
    // SQLite UNIQUE constraint violation
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      return false;
    }
    throw err;
  }
}

export function getMessagesByJob(
  db: Database.Database,
  jobId: number
): TelegramMessageRow[] {
  return db
    .prepare(
      "SELECT * FROM telegram_messages WHERE job_id = ? ORDER BY created_at ASC"
    )
    .all(jobId) as TelegramMessageRow[];
}
