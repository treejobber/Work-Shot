import type Database from "better-sqlite3";

const CURRENT_VERSION = 1;

const SCHEMA_V1 = `
-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_dir     TEXT NOT NULL UNIQUE,
    job_id      TEXT NOT NULL,
    service     TEXT NOT NULL DEFAULT 'tree trim',
    notes       TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    layout      TEXT NOT NULL DEFAULT 'side-by-side',
    source_type TEXT NOT NULL DEFAULT 'manual',
    error_msg   TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    run_at      DATETIME
);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    chat_id         INTEGER PRIMARY KEY,
    state           TEXT NOT NULL DEFAULT 'idle',
    pending_job_id  INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    pending_service TEXT DEFAULT 'tree trim',
    pending_notes   TEXT,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Telegram messages audit log
CREATE TABLE IF NOT EXISTS telegram_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    chat_id     INTEGER NOT NULL,
    message_id  INTEGER NOT NULL,
    direction   TEXT NOT NULL DEFAULT 'inbound',
    role        TEXT NOT NULL,
    file_id     TEXT,
    text        TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id, direction)
);

-- Schema versioning
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER NOT NULL,
    applied_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source_type);
CREATE INDEX IF NOT EXISTS idx_tg_messages_job ON telegram_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_tg_messages_chat ON telegram_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_state ON chat_sessions(state);
`;

/**
 * Returns the current schema version from the database, or 0 if no schema exists.
 */
function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare("SELECT MAX(version) as version FROM schema_version")
      .get() as { version: number | null } | undefined;
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Ensures the database schema is up to date.
 * Runs migrations inside a transaction. Idempotent — safe to call on every startup.
 */
export function ensureSchema(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion >= CURRENT_VERSION) {
    return; // Already up to date
  }

  db.transaction(() => {
    if (currentVersion < 1) {
      db.exec(SCHEMA_V1);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
        CURRENT_VERSION
      );
    }

    // Future migrations go here:
    // if (currentVersion < 2) { migration_2(db); }
  })();
}
