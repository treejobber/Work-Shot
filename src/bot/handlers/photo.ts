import * as fs from "fs";
import * as path from "path";
import { InputFile, type Context } from "grammy";
import type Database from "better-sqlite3";
import {
  getSession,
  upsertSession,
  clearSession,
  insertJob,
  updateJobStatus,
  updateJobMetadata,
  logMessage,
} from "../db";
import { getLargestPhotoFileId, downloadAndValidatePhoto } from "../services/photoDownloader";
import { createJobFolder, writeJobJson } from "../services/jobCreator";
import { runPipeline } from "../services/pipelineRunner";
import { parseServiceText } from "../services/textParser";
import type { BotConfig } from "../config";

/**
 * Handles incoming photo messages (compressed by Telegram).
 */
export async function handlePhoto(
  ctx: Context,
  db: Database.Database,
  config: BotConfig
): Promise<void> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  const fileId = getLargestPhotoFileId(photos);
  const captionText = ctx.message?.caption ?? null;

  await handleIncomingMedia(ctx, db, config, fileId, captionText);
}

/**
 * Handles incoming document messages that are images.
 * Called from bot.ts after MIME type validation.
 */
export async function handleDocumentPhoto(
  ctx: Context,
  db: Database.Database,
  config: BotConfig
): Promise<void> {
  const doc = ctx.message?.document;
  if (!doc) return;

  const fileId = doc.file_id;
  const captionText = ctx.message?.caption ?? null;

  await handleIncomingMedia(ctx, db, config, fileId, captionText);
}

/**
 * Shared media handler implementing the state machine:
 * idle → before_received → processing → idle.
 *
 * Works for both compressed photos and image documents.
 */
async function handleIncomingMedia(
  ctx: Context,
  db: Database.Database,
  config: BotConfig,
  fileId: string,
  captionText: string | null
): Promise<void> {
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  if (!chatId || !messageId) return;

  // Idempotency: check if we already processed this message
  const isNew = logMessage(db, {
    job_id: null, // Will be updated once we know the job
    chat_id: chatId,
    message_id: messageId,
    direction: "inbound",
    role: "before_photo", // Placeholder — may be updated
  });

  if (!isNew) {
    // Duplicate message — already processed
    return;
  }

  const session = getSession(db, chatId);

  // During processing, reject new photos
  if (session?.state === "processing") {
    await ctx.reply("Still processing your photos, please wait...");
    return;
  }

  // Check if there's a caption on the photo/document (service/notes)
  if (captionText) {
    const parsed = parseServiceText(captionText);
    if (session?.state === "before_received") {
      upsertSession(
        db,
        chatId,
        session.state,
        session.pending_job_id,
        parsed.service,
        parsed.notes
      );
      // Also sync metadata to the jobs row
      if (session.pending_job_id) {
        updateJobMetadata(db, session.pending_job_id, parsed.service, parsed.notes);
      }
    } else {
      upsertSession(db, chatId, "idle", null, parsed.service, parsed.notes);
    }
  }

  if (!session || session.state === "idle") {
    // --- FIRST PHOTO (BEFORE) ---
    await handleBeforePhoto(ctx, db, config, chatId, messageId, fileId);
  } else if (session.state === "before_received") {
    // --- SECOND PHOTO (AFTER) ---
    await handleAfterPhoto(ctx, db, config, chatId, messageId, fileId, session.pending_job_id!);
  }
}

async function handleBeforePhoto(
  ctx: Context,
  db: Database.Database,
  config: BotConfig,
  chatId: number,
  messageId: number,
  fileId: string
): Promise<void> {
  // Get pending service/notes from session (from previous text message)
  const existingSession = getSession(db, chatId);
  const service = existingSession?.pending_service ?? "tree trim";
  const notes = existingSession?.pending_notes ?? null;

  // Create job folder
  const { jobDir, jobId } = createJobFolder({
    jobsDir: config.jobsDir,
    chatId,
    service,
    notes,
  });

  // Insert job into DB
  const job = insertJob(db, {
    job_dir: jobDir,
    job_id: jobId,
    service,
    notes,
    source_type: "telegram",
  });

  // Download the photo
  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const destPath = path.join(jobDir, "before.jpg");
    await downloadAndValidatePhoto(fileUrl, destPath);
  } catch (err) {
    updateJobStatus(db, job.id, "error", `Failed to download before photo: ${(err as Error).message}`);
    clearSession(db, chatId);
    await ctx.reply(`Failed to download photo: ${(err as Error).message}`);
    return;
  }

  // Log the message with the correct job_id
  db.prepare(
    "UPDATE telegram_messages SET job_id = ?, role = 'before_photo' WHERE chat_id = ? AND message_id = ? AND direction = 'inbound'"
  ).run(job.id, chatId, messageId);

  // Update session state
  upsertSession(db, chatId, "before_received", job.id, service, notes);

  await ctx.reply(
    "Got the BEFORE photo! Now send the AFTER photo."
  );
}

async function handleAfterPhoto(
  ctx: Context,
  db: Database.Database,
  config: BotConfig,
  chatId: number,
  messageId: number,
  fileId: string,
  jobId: number
): Promise<void> {
  const session = getSession(db, chatId);
  const service = session?.pending_service ?? "tree trim";
  const notes = session?.pending_notes ?? null;

  // Get the job
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as
    | { id: number; job_dir: string; job_id: string }
    | undefined;

  if (!job) {
    clearSession(db, chatId);
    await ctx.reply("Something went wrong — job not found. Send a new BEFORE photo.");
    return;
  }

  // Update session to processing
  upsertSession(db, chatId, "processing", jobId, service, notes);

  // Sync final metadata to jobs row before processing
  updateJobMetadata(db, jobId, service, notes);

  // Download the after photo
  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const destPath = path.join(job.job_dir, "after.jpg");
    await downloadAndValidatePhoto(fileUrl, destPath);
  } catch (err) {
    updateJobStatus(db, jobId, "error", `Failed to download after photo: ${(err as Error).message}`);
    clearSession(db, chatId);
    await ctx.reply(`Failed to download photo: ${(err as Error).message}`);
    return;
  }

  // Update telegram_messages for after photo
  db.prepare(
    "UPDATE telegram_messages SET job_id = ?, role = 'after_photo' WHERE chat_id = ? AND message_id = ? AND direction = 'inbound'"
  ).run(jobId, chatId, messageId);

  // Write job.json now that both photos are present
  writeJobJson({
    jobDir: job.job_dir,
    jobId: job.job_id,
    service,
    notes,
    beforeFilename: "before.jpg",
    afterFilename: "after.jpg",
    chatId,
  });

  updateJobStatus(db, jobId, "processing");
  await ctx.reply("Processing your before & after photos...");

  // Run the pipeline
  const result = await runPipeline(job.job_dir);

  if (result.success) {
    updateJobStatus(db, jobId, "processed");

    // Send the composite back
    try {
      const sentMsg = await ctx.replyWithPhoto(
        new InputFile(result.compositeOutputPath!),
        { caption: result.captionText ?? undefined }
      );

      // Log outbound message
      logMessage(db, {
        job_id: jobId,
        chat_id: chatId,
        message_id: sentMsg.message_id,
        direction: "outbound",
        role: "result_photo",
      });
    } catch (err) {
      // Pipeline succeeded but sending failed — still mark as processed
      await ctx.reply(
        "Pipeline completed but I couldn't send the image. " +
          `Check the output folder: ${job.job_dir}/output/`
      );
    }
  } else {
    updateJobStatus(db, jobId, "error", result.error);
    await ctx.reply(`Pipeline failed: ${result.error}`);

    logMessage(db, {
      job_id: jobId,
      chat_id: chatId,
      message_id: 0, // No specific message for error
      direction: "outbound",
      role: "error",
      text: result.error,
    });
  }

  // Clear session — ready for next job
  clearSession(db, chatId);
}
