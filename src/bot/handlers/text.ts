import type { Context } from "grammy";
import type Database from "better-sqlite3";
import { getSession, upsertSession, updateJobMetadata } from "../db";
import { parseServiceText } from "../services/textParser";

/**
 * Handles text messages (non-command).
 * Parses for service/notes and saves to session.
 * When a job is pending (before_received), also syncs metadata to the jobs row.
 */
export async function handleText(
  ctx: Context,
  db: Database.Database
): Promise<void> {
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text;
  if (!chatId || !text) return;

  const session = getSession(db, chatId);

  // During processing, ignore text
  if (session?.state === "processing") {
    await ctx.reply("Still processing your photos, please wait...");
    return;
  }

  const parsed = parseServiceText(text);

  if (session?.state === "before_received") {
    // Update the pending job's service/notes in session
    upsertSession(
      db,
      chatId,
      "before_received",
      session.pending_job_id,
      parsed.service,
      parsed.notes
    );
    // Sync metadata to the jobs row so DB stays aligned
    if (session.pending_job_id) {
      updateJobMetadata(db, session.pending_job_id, parsed.service, parsed.notes);
    }
    await ctx.reply(
      `Got it: ${parsed.service}${parsed.notes !== parsed.service ? ` — "${parsed.notes}"` : ""}\n` +
        "Now send the AFTER photo."
    );
  } else {
    // Idle — save as pending for the next job
    upsertSession(db, chatId, "idle", null, parsed.service, parsed.notes);
    await ctx.reply(
      `Saved for next job: ${parsed.service}${parsed.notes !== parsed.service ? ` — "${parsed.notes}"` : ""}\n` +
        "Send a BEFORE photo to start."
    );
  }
}
