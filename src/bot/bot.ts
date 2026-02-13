import { Bot } from "grammy";
import type Database from "better-sqlite3";
import type { BotConfig } from "./config";
import { handleStart, handleStatus, handleCancel } from "./handlers/commands";
import { handlePhoto, handleDocumentPhoto } from "./handlers/photo";
import { handleText } from "./handlers/text";
import { isImageMimeType } from "./services/photoDownloader";

/**
 * Creates and configures the grammY Bot instance with all middleware and handlers.
 */
export function createBot(
  config: BotConfig,
  db: Database.Database
): Bot {
  const bot = new Bot(config.botToken);

  // --- Authorization middleware ---
  if (config.authorizedChats.length > 0) {
    bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id;
      if (chatId && !config.authorizedChats.includes(chatId)) {
        console.log(`[auth] Rejected message from unauthorized chat ${chatId}`);
        return; // Silently drop
      }
      await next();
    });
  }

  // --- Error handler ---
  bot.catch((err) => {
    console.error("[bot] Unhandled error:", err.message);
    console.error(err.stack);
  });

  // --- Commands ---
  bot.command("start", (ctx) => handleStart(ctx));
  bot.command("help", (ctx) => handleStart(ctx));
  bot.command("status", (ctx) => handleStatus(ctx, db));
  bot.command("cancel", (ctx) => handleCancel(ctx, db));

  // --- Photo handler (compressed photos) ---
  bot.on("message:photo", (ctx) => handlePhoto(ctx, db, config));

  // --- Document handler (image documents for full resolution, reject non-images) ---
  bot.on("message:document", (ctx) => {
    const doc = ctx.message.document;
    if (isImageMimeType(doc.mime_type)) {
      return handleDocumentPhoto(ctx, db, config);
    }
    return ctx.reply(
      "That file type is not supported. Please send an image (JPEG, PNG, or WebP)."
    );
  });

  // --- Text handler (non-command text messages) ---
  bot.on("message:text", (ctx) => {
    // Skip if it's a command (already handled above)
    if (ctx.message.text.startsWith("/")) return;
    return handleText(ctx, db);
  });

  // --- Unsupported media types ---
  bot.on("message:video", async (ctx) => {
    await ctx.reply("Video is not supported yet. Please send photos only.");
  });

  return bot;
}
