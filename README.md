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

## Structure

- `src/` — Application source (TypeScript)
- `src/pipeline/` — Pipeline modules (ingest, compose, caption, manifest)
- `jobs/` — Input photos (local only, not tracked except `_example/`)
- `dist/` — Compiled output (local only, not tracked)
- `tests/` — Integration tests
- `docs/` — Documentation and planning
