import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export interface BotConfig {
  /** Telegram Bot API token */
  botToken: string;
  /** Comma-separated list of authorized Telegram chat IDs (empty = allow all) */
  authorizedChats: number[];
  /** Path to the SQLite database file */
  dbPath: string;
  /** Path to the jobs directory */
  jobsDir: string;
  /** Session timeout in minutes (default: 30) */
  sessionTimeoutMinutes: number;
  /** Platform names for auto social generation after pipeline (empty = disabled) */
  socialPlatforms: string[];
}

export function loadConfig(): BotConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set. Add it to .env or set it as an environment variable."
    );
  }

  const authorizedChatsRaw = process.env.TELEGRAM_AUTHORIZED_CHATS ?? "";
  const authorizedChats = authorizedChatsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) {
        throw new Error(
          `Invalid chat ID in TELEGRAM_AUTHORIZED_CHATS: "${s}". Must be a number.`
        );
      }
      return n;
    });

  const dbPath = process.env.WORKSHOT_DB_PATH
    ?? path.resolve(__dirname, "../../workshot.db");

  const jobsDir = process.env.WORKSHOT_JOBS_DIR
    ?? path.resolve(__dirname, "../../jobs");

  const sessionTimeoutMinutes = Number(
    process.env.WORKSHOT_SESSION_TIMEOUT_MINUTES ?? "30"
  );
  if (!Number.isFinite(sessionTimeoutMinutes) || sessionTimeoutMinutes <= 0) {
    throw new Error(
      `Invalid WORKSHOT_SESSION_TIMEOUT_MINUTES: must be a positive number.`
    );
  }

  const socialPlatformsRaw = process.env.WORKSHOT_BOT_SOCIAL_PLATFORMS ?? "";
  const socialPlatforms = socialPlatformsRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  return {
    botToken,
    authorizedChats,
    dbPath,
    jobsDir,
    sessionTimeoutMinutes,
    socialPlatforms,
  };
}
