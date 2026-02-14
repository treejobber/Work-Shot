import { loadConfig } from "./config";
import { openDatabase } from "./db/connection";
import { ensureSchema } from "./db/schema";
import { createBot } from "./bot";
import { reconcileOnStartup, startSessionTimeoutChecker } from "./sessionTimeout";
import { validateSocialPlatforms } from "./services/socialRunner";

async function main(): Promise<void> {
  console.log("[workshot-bot] Starting...");

  // 1. Load configuration
  const config = loadConfig();
  validateSocialPlatforms(config.socialPlatforms);
  console.log("[workshot-bot] Config loaded.");

  // 2. Open database and ensure schema
  const db = openDatabase(config.dbPath);
  ensureSchema(db);
  console.log(`[workshot-bot] Database ready: ${config.dbPath}`);

  // 3. Reconcile stuck sessions from previous run
  reconcileOnStartup(db);

  // 4. Create bot
  const bot = createBot(config, db);

  // 5. Start session timeout checker
  const timeoutInterval = startSessionTimeoutChecker(
    db,
    config.sessionTimeoutMinutes,
    bot
  );

  // 6. Graceful shutdown
  const shutdown = () => {
    console.log("\n[workshot-bot] Shutting down...");
    clearInterval(timeoutInterval);
    bot.stop();
    db.close();
    console.log("[workshot-bot] Goodbye.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 7. Start polling
  const me = await bot.api.getMe();
  console.log(`[workshot-bot] Logged in as @${me.username}`);
  console.log(`[workshot-bot] Jobs directory: ${config.jobsDir}`);
  console.log(
    `[workshot-bot] Session timeout: ${config.sessionTimeoutMinutes} minutes`
  );
  if (config.authorizedChats.length > 0) {
    console.log(
      `[workshot-bot] Authorized chats: ${config.authorizedChats.join(", ")}`
    );
  } else {
    console.log("[workshot-bot] All chats authorized (no restriction).");
  }
  if (config.socialPlatforms.length > 0) {
    console.log(
      `[workshot-bot] Auto social: ${config.socialPlatforms.join(", ")}`
    );
  } else {
    console.log("[workshot-bot] Auto social: disabled");
  }

  bot.start();
}

main().catch((err) => {
  console.error("[workshot-bot] Fatal error:", err);
  process.exit(1);
});
