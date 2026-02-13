import type { Context } from "grammy";
import type Database from "better-sqlite3";
import { getSession, clearSession, updateJobStatus, getJobById } from "../db";

/**
 * /start and /help — show instructions.
 */
export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    "Welcome to WorkShot! Send me your before & after photos.\n\n" +
      "1. Send the BEFORE photo\n" +
      "2. Send the AFTER photo\n" +
      "3. I'll create the composite automatically!\n\n" +
      "You can also send a text message with job details " +
      "(e.g., \"tree removal Big oak in backyard\").\n\n" +
      "Commands:\n" +
      "/status — Check current session state\n" +
      "/cancel — Cancel the current job\n" +
      "/help — Show this message"
  );
}

/**
 * /status — show current session state.
 */
export async function handleStatus(
  ctx: Context,
  db: Database.Database
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(db, chatId);

  if (!session || session.state === "idle") {
    await ctx.reply("No active session. Send a BEFORE photo to start a new job.");
    return;
  }

  if (session.state === "before_received") {
    await ctx.reply(
      "Waiting for the AFTER photo.\n" +
        `Service: ${session.pending_service}\n` +
        (session.pending_notes ? `Notes: ${session.pending_notes}` : "")
    );
    return;
  }

  if (session.state === "processing") {
    await ctx.reply("Processing your photos... please wait.");
    return;
  }
}

/**
 * /cancel — cancel the current job.
 */
export async function handleCancel(
  ctx: Context,
  db: Database.Database
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(db, chatId);

  if (!session || session.state === "idle") {
    await ctx.reply("Nothing to cancel.");
    return;
  }

  if (session.state === "processing") {
    await ctx.reply("Cannot cancel — pipeline is already running. Please wait.");
    return;
  }

  // Cancel the pending job
  if (session.pending_job_id) {
    updateJobStatus(db, session.pending_job_id, "error", "Cancelled by user");
  }

  clearSession(db, chatId);
  await ctx.reply("Job cancelled. Send a new BEFORE photo to start over.");
}
