import * as fs from "fs";
import * as path from "path";
import type Database from "better-sqlite3";
import type { Bot } from "grammy";
import {
  getStaleSessions,
  getSessionsByState,
  clearSession,
  updateJobStatus,
  getJobById,
} from "./db";

/**
 * Reconcile stuck sessions on bot startup.
 * Runs BEFORE polling begins so no messages are processed until recovery is complete.
 */
export function reconcileOnStartup(db: Database.Database): void {
  // 1. Stuck "processing" sessions
  const processingSessions = getSessionsByState(db, "processing");
  for (const session of processingSessions) {
    if (session.pending_job_id) {
      const job = getJobById(db, session.pending_job_id);
      if (job) {
        const outputFile = path.join(job.job_dir, "output", "before_after.png");
        if (fs.existsSync(outputFile)) {
          // Pipeline completed successfully before crash
          updateJobStatus(db, job.id, "processed");
          console.log(
            `[reconcile] Job ${job.job_id}: output exists, marked as processed.`
          );
        } else {
          // Pipeline was interrupted
          updateJobStatus(
            db,
            job.id,
            "error",
            "Bot restarted during processing"
          );
          console.log(
            `[reconcile] Job ${job.job_id}: no output, marked as error.`
          );
        }
      }
    }
    clearSession(db, session.chat_id);
    console.log(
      `[reconcile] Chat ${session.chat_id}: cleared stuck processing session.`
    );
  }

  // 2. Stale "before_received" sessions (using a generous timeout of 60 min for startup)
  const staleSessions = getSessionsByState(db, "before_received");
  for (const session of staleSessions) {
    if (session.pending_job_id) {
      updateJobStatus(
        db,
        session.pending_job_id,
        "error",
        "Session expired (bot restarted)"
      );
    }
    clearSession(db, session.chat_id);
    console.log(
      `[reconcile] Chat ${session.chat_id}: cleared stale before_received session.`
    );
  }

  if (processingSessions.length === 0 && staleSessions.length === 0) {
    console.log("[reconcile] No stuck sessions found.");
  }
}

/**
 * Periodically check for stale sessions and auto-cancel them.
 * Returns the interval handle so it can be cleared on shutdown.
 */
export function startSessionTimeoutChecker(
  db: Database.Database,
  timeoutMinutes: number,
  bot?: Bot
): ReturnType<typeof setInterval> {
  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

  return setInterval(async () => {
    const stale = getStaleSessions(db, timeoutMinutes);

    for (const session of stale) {
      if (session.pending_job_id) {
        updateJobStatus(
          db,
          session.pending_job_id,
          "error",
          `Session timed out after ${timeoutMinutes} minutes`
        );
      }

      clearSession(db, session.chat_id);

      // Best-effort: notify the chat
      if (bot) {
        try {
          await bot.api.sendMessage(
            session.chat_id,
            `Session timed out after ${timeoutMinutes} minutes of inactivity. Send a new BEFORE photo to start over.`
          );
        } catch {
          // Chat might be unavailable — that's fine
        }
      }

      console.log(
        `[timeout] Chat ${session.chat_id}: session timed out and cleared.`
      );
    }
  }, CHECK_INTERVAL_MS);
}
