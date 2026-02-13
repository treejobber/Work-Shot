# WorkShot Build Plan

## Philosophy
Build in vertical slices: ship a working end-to-end feature, then tighten it up. Choose speed over architecture; keep the code obvious and easy to change. The repo grows around working features, not future guesses. Avoid premature infrastructure (cloud, accounts, services, pipelines) until the local workflow is proven.

## Phase R1 — Local MVP Pipeline
A local CLI that turns a “job folder” into final before/after visuals and captions with deterministic, repeatable output. Everything runs offline: no network calls, no external APIs.

**Goal**
- From a local job folder, generate social-ready before/after composites + ready-to-paste captions.

**Scope**
- Local CLI to run the pipeline against a job directory.
- CLI surface (R1):
  - `workshot run <job_dir>` (writes into `<job_dir>/output/`)
  - `workshot validate <job_dir>` (no writes; tells you what’s missing/ambiguous)
- Job folder structure (minimal, human-friendly):
  - `job.json` (or similar) for metadata (address/area, date, crew, work type, notes, optional tags) and optional explicit pair mapping.
  - `before/` and `after/` image folders (originals kept as-is).
  - `output/` for generated artifacts.
- Example job layout:
  - `jobs/2026-02-02_oak-removal/job.json`
  - `jobs/2026-02-02_oak-removal/before/001.jpg`
  - `jobs/2026-02-02_oak-removal/after/001.jpg`
  - `jobs/2026-02-02_oak-removal/output/001_before-after.jpg`
  - `jobs/2026-02-02_oak-removal/output/001_caption.txt`
- Before/after pairing rules:
  - Use explicit pairs from metadata when present; otherwise fall back to filename stem matching.
  - If pairing is missing/ambiguous, fail loudly with a clear message (don’t guess silently).
- Composite image generation:
  - Deterministic layout (e.g., side-by-side), consistent sizing, padding, and labels (“Before”, “After”).
  - Normalize EXIF orientation; pick one resize policy (fit-with-padding or crop) and keep it fixed.
  - Optional simple branding (logo/text) if provided locally.
- Caption generation:
  - Deterministic, template-based captions using job metadata (no LLM in R1).
  - Output as plain text files alongside images.
- Deterministic output:
  - Same inputs produce the same filenames and the same visuals/layout.
  - Keep outputs stable by sorting inputs, fixing encoder settings, and stripping metadata (avoid timestamps).
- No network calls:
  - No cloud storage, no webhooks, no model APIs, no telemetry.

**Out of scope**
- WhatsApp intake, webhooks, or any inbound messaging.
- Cloud storage, accounts, auth, dashboards.
- Automatic “best photo” selection beyond simple pairing rules.
- Non-deterministic AI captioning or generative edits.
- Multi-platform publishing/sharing automation.

**Success criteria**
- A new job folder can be processed end-to-end on a laptop with one command.
- Outputs include at least one composite image and a matching caption file.
- Re-running the pipeline without changing inputs produces the same filenames and the same visuals/layout.
- Failures are actionable (clear messages: what’s missing, where to fix it).

## Phase R1.5 — Job Helper Tools
Small CLI helpers to reduce friction and standardize inputs without adding new infrastructure.

- `new-job` helper to create a job folder with the right skeleton (`before/`, `after/`, metadata file).
- Metadata scaffolding with sensible defaults and prompts (keep it optional; power users can edit files directly).
- Optional helper to create/maintain explicit pair mapping (so the pipeline never has to guess).
- Usability upgrades: validation, “what’s missing” reports, dry-run, and a quick “open output folder” convenience.

## Phase R2 — WhatsApp Intake
Bring photos in automatically, but reuse the same local pipeline and folder structure.

- WhatsApp webhook intake (initially a simple local/hosted listener that writes to disk).
- Auto job creation from inbound messages (job per thread/contact/time window).
- Photo ingestion into `before/` / `after/` (or an `inbox/` with later sorting rules).
- Reuse Phase R1 pipeline unchanged: intake only prepares a job folder, then runs the same generator.

## Phase R3 — Social Media Output Layer
Package R1 pipeline output into platform-specific formats for real-world posting. Files only — no API posting, no auto-publishing.

### R3 Contract (operator-approved 2026-02-12)
- **CLI surface:** `workshot social <job_dir> --platform nextdoor [--platform facebook] [--all]`
  - Extends existing CLI with a `social` subcommand (additive, `run`/`validate` unchanged)
  - Requires R1 `run` to have completed (checks `output/manifest.json`)
- **Output location:** `<job_dir>/output/social/<platform>/`
  - R1 `output/` files are never modified
  - Each platform gets its own subfolder: `image.jpg`, `caption.txt`, `manifest.json`
- **Labels:** Same BEFORE/AFTER style as R1 (consistent branding)
- **Image source:** Original before/after images resolved from R1 `manifest.json` → `inputs.mediaPairs[0]`
- **Code location:** `src/social/` — new module, does not import from `src/pipeline/` internals
  - Shared label-rendering logic extracted to `src/lib/labels.ts` (importable by both R1 and social)
- **No new production npm dependencies** for R3.1 (devDeps for R&D scripts pre-date R3)

### R3.1 — Nextdoor Static Export (MVP)
Narrowest possible slice: one platform, static image only, center-crop, deterministic.

**Scope:**
- Platform adapter pattern: `PlatformAdapter` interface + registry
- Nextdoor adapter: 1200x675 (16:9), JPEG q90, side-by-side layout, no hashtags
- Center-crop both images to target aspect ratio (no Gemini smart-crop yet)
- Deterministic caption from job metadata (template-based, same approach as R1)
- Per-platform manifest in `output/social/nextdoor/manifest.json` (references R1 manifest, no fragmentation)

**Files created:**
- `src/lib/labels.ts` — shared SVG label rendering (extracted pattern, not duplicated)
- `src/social/types.ts` — PlatformAdapter, PlatformSpec interfaces
- `src/social/platforms/nextdoor.ts` — Nextdoor adapter
- `src/social/composer.ts` — platform-aware image composition
- `src/social/captionWriter.ts` — platform caption generation
- `src/social/index.ts` — `runSocial()` entry point
- `src/cli/parseArgs.ts` — add `social` command branch (existing commands untouched)
- `src/index.ts` — add `social` handler (existing flow untouched)
- `tests/social/**` — all new test files

**Exit criteria (all automated in tests):**
- `workshot social jobs/_example --platform nextdoor` produces `output/social/nextdoor/image.jpg`
- Image is 1200x675, JPEG format, under 10MB
- Caption is under 8192 chars, matches expected template output
- All existing tests pass (zero R1/R2 regressions)
- R1 `output/manifest.json`, `before_after.png`, `caption.generic.txt` unchanged (SHA256 verified)

### R3.2 — Gemini Smart-Crop (future)
Promote `scripts/smart-crop.ts` → `src/social/smartCrop.ts`. Center-crop fallback when no API key. Follow `docs/GEMINI_PROMPTING_PATTERNS.md`.

### R3.3 — Additional Platforms (future)
One at a time: Facebook → Instagram → Google Business → TikTok → YouTube.

### R3.4 — Crossfade GIF (future)
Promote `scripts/test-crossfade.ts` → `src/social/crossfade.ts` as optional artifact.

### R3.5 — Bot Integration (future)
Auto-generate social outputs after bot runs R1. Requires separate operator approval.

## Phase R4 — Production Hardening
Make it reliable enough to run daily without babysitting.

- Storage: clear retention rules, predictable paths, backup/export strategy.
- Reliability: idempotent runs, crash-safe writes, resume/retry behavior.
- Safety: input sanitization, safe handling of personal info, local-only defaults.
- Monitoring: simple logs and run summaries first; metrics only if needed.
- Scaling decisions: move to services/cloud only when local-first limits are proven and painful.

## Rules for Updating This Document
- This file is the only roadmap
- Do not create new planning docs
- All changes are edits, not forks
- Operator approval required for scope changes
