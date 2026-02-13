# WorkShot — Claude Code Firmware

## Project State

WorkShot is a local CLI tool + Telegram bot for before/after photo composition and caption generation for tree service businesses. TypeScript + Node.js + sharp + grammY + SQLite.

**R1:** COMPLETE (contract frozen). Local CLI pipeline.
**R2:** COMPLETE. Telegram bot intake + SQLite database.

### R2 implementation
- Telegram bot via grammY (long polling, no webhooks)
- SQLite via better-sqlite3 (WAL mode, schema migrations)
- State machine: idle → before_received → processing → idle
- In-process pipeline (imports R1 modules directly, parity-tested against CLI)
- Accepts both compressed photos and image documents (JPEG, PNG, WebP)
- Non-image documents rejected with actionable message
- DB job metadata synced on text updates during before_received (no drift)
- Idempotency: UNIQUE(chat_id, message_id, direction) prevents duplicate processing
- Crash recovery: reconcileOnStartup() sweeps stuck sessions before polling
- 122 tests total (55 R1 + 67 bot)

### File map
| File | Heat | Notes |
|------|------|-------|
| `src/bot/index.ts` | HOT | Bot entry point |
| `src/bot/bot.ts` | HOT | grammY bot instance + middleware |
| `src/bot/handlers/photo.ts` | HOT | Photo state machine (core logic) |
| `src/bot/handlers/text.ts` | WARM | Text/service parsing |
| `src/bot/handlers/commands.ts` | WARM | /start, /help, /status, /cancel |
| `src/bot/services/pipelineRunner.ts` | WARM | In-process R1 pipeline |
| `src/bot/services/jobCreator.ts` | WARM | Job folder + job.json creation |
| `src/bot/services/photoDownloader.ts` | WARM | Telegram photo download + validation |
| `src/bot/services/textParser.ts` | COLD | Service keyword matching |
| `src/bot/db/` | WARM | SQLite schema, queries, connection |
| `src/bot/config.ts` | COLD | .env config loader |
| `src/bot/sessionTimeout.ts` | WARM | Stale session cleanup + crash recovery |
| `src/bot/types.ts` | COLD | Bot-specific types |
| `src/pipeline/*` | COLD | R1 pipeline modules (frozen) |
| `src/contracts/*` | COLD | Shared types (frozen) |

## Governance

- **YOU MUST** escalate architectural decisions to operator (Scott)
- **IMPORTANT:** R1 contract is frozen. Do not change CLI surface, schema, or output format
- Authority: you may choose tooling, file layout, and routine implementation details
- Stop: if you encounter a design ambiguity that affects the public contract, ask the operator

## References

- @docs/FINAL_BUILD_PLAN.md — R1 phase details
- @docs/AGENTIC_SYSTEM_DESIGN.md — Agent roles and prompt templates
- @docs/DASHBOARD_PLAN.md — Approved dashboard plan (deferred)

## Canary

End status reports with: `-- WorkShot`
