# WorkShot

Local CLI tool for before/after photo composition and caption generation for tree service businesses.

## Prerequisites

- Node.js 22+ (see `.nvmrc`)

## Quick Start

```bash
npm ci
npm run build
```

## Usage

### Run the pipeline

```bash
node dist/index.js run <job_dir> [--layout side-by-side|stacked]
```

Processes a job folder and writes output to `<job_dir>/output/`:
- `before_after.png` — composited image with BEFORE/AFTER labels
- `caption.generic.txt` — generated caption text
- `manifest.json` — machine-readable run manifest

### Validate a job folder

```bash
node dist/index.js validate <job_dir>
```

Checks that a job folder has the required structure (images, metadata) without running the pipeline.

### Job folder structure

```
<job_dir>/
  job.json          (required metadata)
  before.png        (or .jpg/.jpeg)
  after.png         (or .jpg/.jpeg)
  output/           (created by run command)
```

`job.json` is required. See `jobs/_example/job.json` for the schema.

### Run tests

```bash
npm test
```

## Determinism Policy

WorkShot enforces two tiers of output determinism:

- **Tier 1 (required, cross-platform):** Deterministic artifact filenames, manifest structure/references, image dimensions per layout, and caption byte identity for the same input. These are blocking CI gates.
- **Tier 2 (pinned environment only):** Image byte-level hash equality across repeat runs with the same OS, Node version, exact lockfile, and input fixtures. This is a non-blocking CI diagnostic.

**Sharp is pinned to an exact version** (`0.33.5`) to reduce cross-environment variance. PNG output uses explicit settings (`compressionLevel: 9, adaptiveFiltering: false, palette: false`).

**Re-baseline rule:** Tier-2 baselines must be updated whenever the sharp version or PNG output settings change. This is a deliberate, tested operation — not an automatic bump.

## Telegram Bot

WorkShot includes a Telegram bot that accepts before/after photos from field crews, automatically runs the pipeline, and sends the composite back.

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Copy `.env.example` to `.env` and set your bot token
3. Optionally restrict access by setting `TELEGRAM_AUTHORIZED_CHATS`

### Run the bot

```bash
npm run build
npm run bot
```

### How it works

1. Send the **BEFORE** photo to the bot (as a photo or image document for full resolution)
2. Optionally send a text message with job details (e.g., "tree removal Big oak")
3. Send the **AFTER** photo (as a photo or image document)
4. Bot automatically creates a job folder, runs the pipeline, and sends back the composite

Photos can be sent as regular Telegram photos (compressed) or as image documents (JPEG, PNG, WebP) for full resolution. Non-image documents (PDF, video, etc.) are rejected with an actionable message.

### Bot commands

- `/start`, `/help` — Show instructions
- `/status` — Check current session state
- `/cancel` — Cancel the current job

### Crash recovery

The bot reconciles stuck sessions on every startup. If the bot crashes during processing, restarting it will automatically recover.

## Structure

- `src/` — Application source (TypeScript)
- `src/pipeline/` — Pipeline modules (ingest, compose, caption, manifest)
- `src/bot/` — Telegram bot (handlers, services, database)
- `src/bot/db/` — SQLite database layer (schema, queries)
- `src/bot/services/` — Bot services (photo download, job creation, pipeline runner)
- `src/bot/handlers/` — Message handlers (photo, text, commands)
- `jobs/` — Input photos (local only, not tracked except `_example/`)
- `dist/` — Compiled output (local only, not tracked)
- `tests/` — Integration tests
- `docs/` — Documentation and planning
