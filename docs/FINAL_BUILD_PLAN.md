# WorkShot Final Build Plan (R1, Forward-Compatible)

Date: 2026-02-10  
Role: ARCHITECT (PLAN)  
Scope: R1 local photo pipeline only. No WhatsApp intake, publishing, SMS sending, video processing, or standalone app work is implemented in this plan.

This plan synthesizes:
- `docs/ARCHITECTURE_RECON_REPORT.md`
- `docs/CODEX_BUILD_PLAN.md`
- `docs/OPUS_CRITIQUE.md`

## Section 1: Resolution Table

### Opus Findings (6)
| Finding | Decision | Justification |
|---|---|---|
| 1. Clean clone is non-functional (lockfile mismatch) | ACCEPT | `package.json` declares `sharp` and `@types/node`, but `package-lock.json` only contains TypeScript, so build/install reproducibility is a hard gate (`package.json:10`, `package.json:13`, `package-lock.json:10`, `package-lock.json:14`). |
| 2. `dist/` is stale tracked artifact despite ignore rule | ACCEPT | `.gitignore` excludes `dist/`, but tracked compiled artifacts exist and can mask source/build truth, so untracking `dist/` is required (`.gitignore:2`, `dist/index.js:1`). |
| 3. CLI migration was sequenced before tests | ACCEPT | Contract migration must not occur without regression coverage; test scaffolding is moved ahead of CLI migration (`docs/CODEX_BUILD_PLAN.md:55`, `docs/CODEX_BUILD_PLAN.md:71`). |
| 4. Path-safety risk context needed | MODIFY | Severity is lower for local CLI use, but containment checks remain mandatory and must target the new `<job_dir>` contract (`src/index.ts:72`, `src/index.ts:73`). |
| 5. Caption text is tree-service specific | ACCEPT | Treated as intentional R1 domain constraint and explicitly documented as such (`src/pipeline/caption.ts:11`, `src/pipeline/caption.ts:17`, `jobs/_example/meta.json:2`). |
| 6. Byte determinism across sharp/libvips is fragile | ACCEPT | Determinism is split into structural and byte-level tiers; dependency pinning and re-baseline policy are added (`src/pipeline/compose.ts:139`, `src/pipeline/compose.ts:159`, `package.json:10`). |

### Opus Plan Deltas (5)
| Delta | Decision | Justification |
|---|---|---|
| 1. Expand Phase 1 prerequisites | ACCEPT | Phase 1 now includes lock reconciliation, sharp runtime load check, `dist/` untracking, Node pinning, and onboarding correction as hard entry criteria. |
| 2. Move tests before CLI migration | ACCEPT | Minimal integration tests are added in Phase 1 to guard current behavior before introducing `run/validate` migration. |
| 3. Target path safety to Phase 2 contract | ACCEPT | Path safety scope is explicitly bound to `<job_dir>` reads and `<job_dir>/output` writes in Phase 3. |
| 4. Tiered determinism assertions | ACCEPT | Tier 1 (structural) is cross-platform required; Tier 2 (byte hash) is pinned-environment required. |
| 5. Pin sharp exactly | MODIFY | Exact pin is adopted for R1 reproducibility; version bumps remain allowed only as deliberate, tested contract changes with Tier-2 re-baseline. |

## Section 2: Contract Decisions

### CLI interface (final)
Canonical R1 interface:
- `workshot run <job_dir> [--layout side-by-side|stacked]`
- `workshot validate <job_dir>`

Compatibility mode (temporary):
- `--job <name>` is accepted during migration and mapped to `<repo>/jobs/<name>` (`src/index.ts:25`, `src/index.ts:70`).
- Compatibility mode prints deprecation warning and writes to canonical output location under resolved job folder.

Decision rationale:
- Aligns with roadmap target (`docs/BUILD_PLAN.md:15`, `docs/BUILD_PLAN.md:16`).
- Removes coupling to repo-root runtime state (`src/index.ts:70`, `src/index.ts:71`).
- Supports R2+ automatic job creation where jobs may not originate in `jobs/`.

### Job folder structure (final, forward-compatible schema)
Canonical portable job unit:

```text
<job_dir>/
  job.json
  before.jpg|before.jpeg|before.png
  after.jpg|after.jpeg|after.png
  output/
```

R1 compatibility:
- If `job.json` is missing but `meta.json` exists, loader maps `meta.json` to in-memory `job.json` shape for backward compatibility (`src/pipeline/ingest.ts:61`).

`job.json` schema v1 (R1 minimum + forward-compatible optional fields):

```json
{
  "schemaVersion": "1.0",
  "jobId": "string",
  "createdAt": "ISO-8601",
  "source": {
    "type": "manual",
    "sourceRef": null,
    "messageId": null,
    "threadId": null
  },
  "customer": {
    "name": null,
    "phone": null,
    "address": null
  },
  "businessOwner": {
    "phone": null
  },
  "work": {
    "service": "tree trim",
    "notes": "Optional note",
    "workType": null,
    "crew": null,
    "workDate": null
  },
  "targets": {
    "platforms": ["generic"],
    "publish": false
  },
  "media": {
    "pairs": [
      {
        "pairId": "primary",
        "before": "before.jpg",
        "after": "after.jpg",
        "mediaType": "photo"
      }
    ]
  }
}
```

R1 usage:
- Required in runtime: `work.service`, `work.notes` (optional), first `media.pairs[0]` before/after references.
- Optional fields remain present for R2+ intake/publishing/SMS workflows.

### Output format (final, machine-readable)
R1 outputs in `<job_dir>/output/`:
- `before_after.png`
- `caption.generic.txt`
- `manifest.json` (required)

`manifest.json` schema v1:

```json
{
  "schemaVersion": "1.0",
  "jobId": "string",
  "runId": "string",
  "generatedAt": "ISO-8601",
  "layout": "side-by-side",
  "inputs": {
    "jobFile": "../job.json",
    "mediaPairs": [
      {
        "pairId": "primary",
        "before": "../before.jpg",
        "after": "../after.jpg",
        "mediaType": "photo"
      }
    ]
  },
  "artifacts": [
    {
      "artifactId": "primary-composite",
      "kind": "media",
      "mediaType": "photo",
      "role": "composite",
      "path": "before_after.png",
      "width": 0,
      "height": 0,
      "sha256": "hex"
    }
  ],
  "captions": {
    "generic": {
      "path": "caption.generic.txt",
      "charCount": 0
    },
    "platform": {
      "facebook": {
        "status": "not_generated",
        "fallback": "generic"
      },
      "instagram": {
        "status": "not_generated",
        "fallback": "generic"
      },
      "google_business_profile": {
        "status": "not_generated",
        "fallback": "generic"
      },
      "tiktok": {
        "status": "not_generated",
        "fallback": "generic"
      },
      "youtube": {
        "status": "not_generated",
        "fallback": "generic"
      }
    }
  },
  "targets": {
    "requestedPlatforms": ["generic"],
    "publish": false
  },
  "warnings": []
}
```

### Caption strategy (forward-compatible)
- Introduce caption interface that returns a map keyed by platform (`generic`, `facebook`, `instagram`, etc.).
- R1 generates only `generic` text and records platform entries as `not_generated` with `fallback: generic` in manifest.
- R1 caption text remains deterministic and domain-specific baseline from existing implementation (`src/pipeline/caption.ts:11`, `src/pipeline/caption.ts:17`).

### Deprecated and removal timing
- Deprecated at end of Phase 2:
  - `--job <name>` legacy invocation.
  - `meta.json` as primary metadata contract.
  - `out/<job>/` output path.
- Removed at Phase 6 exit (after tests + docs + operator approval):
  - legacy CLI mode,
  - legacy metadata-only mode.

## Section 3: Phased Build Plan

### Phase 1 — Reproducibility + Onboarding Gate
- Goal: Make clean-clone install/build/test deterministic and truthful.
- Scope:
  - Reconcile `package.json` and `package-lock.json` dependency state.
  - Pin Node version via `.nvmrc`.
  - Verify sharp runtime load on target environment.
  - Untrack stale `dist/` artifacts.
  - Add minimal test harness and baseline integration tests for current behavior.
  - Fix README quick-start to reflect actually runnable command.
- Files touched:
  - `package.json`, `package-lock.json`, `.nvmrc`, `README.md`, `dist/*` (untracked), test config + `tests/*`.
- Exit condition:
  - `npm ci`, `npm run build`, and baseline tests pass from clean clone.
  - `node -e "require('sharp')"` passes.
  - `dist/` is no longer tracked.
- Dependencies:
  - None.

### Phase 2 — Contract Migration (CLI + Schema + Manifest)
- Goal: Establish canonical R1 contract while preserving temporary compatibility.
- Scope:
  - Add command-based CLI: `run` and `validate`.
  - Implement `job.json` loading and compatibility bridge from `meta.json`.
  - Add `manifest.json` generation in output.
  - Keep legacy `--job` path operational with deprecation warning.
  - Route outputs to `<job_dir>/output/` for both canonical and legacy invocations.
- Files touched:
  - `src/index.ts`, `src/cli/*` (new), `src/pipeline/ingest.ts`, `src/pipeline/caption.ts`, output writer module (new), `README.md`, `jobs/_example/*`.
- Exit condition:
  - `run` and `validate` operate against portable `<job_dir>`.
  - Outputs include composite, caption, and valid manifest.
  - Backward compatibility tests pass.
- Dependencies:
  - Phase 1 tests and reproducible build are green.

### Phase 3 — Safety Hardening (new contract boundaries)
- Goal: Enforce safe, explicit filesystem and input behavior under `<job_dir>` contract.
- Scope:
  - Centralize path normalization + containment checks.
  - Guarantee read boundaries (`<job_dir>` only) and write boundaries (`<job_dir>/output` only).
  - Define malformed metadata policy and apply consistently in `validate` and `run`.
  - Standardize actionable validation errors.
- Files touched:
  - `src/lib/pathSafety.ts` (new), `src/index.ts`, `src/pipeline/ingest.ts`, `tests/*`, docs.
- Exit condition:
  - Path traversal and malformed input tests pass.
  - No path escape possible through CLI arguments.
- Dependencies:
  - Phase 2 canonical contract complete.

### Phase 4 — Determinism + Quality Gates
- Goal: Make determinism and regression checks enforceable in automation.
- Scope:
  - Implement Tier-1 and Tier-2 determinism assertions.
  - Pin sharp to exact version and document re-baseline rules.
  - Set explicit image output settings where needed to reduce variance.
  - Add CI gates for install/build/test.
- Files touched:
  - `package.json`, `package-lock.json`, `src/pipeline/compose.ts`, `tests/*`, `.github/workflows/*`, docs.
- Exit condition:
  - Tier-1 determinism passes in CI.
  - Tier-2 repeat-run hash passes in pinned environment.
  - CI blocks failing merges.
- Dependencies:
  - Phase 1-3 functionality and tests green.

### Phase 5 — Architecture Stabilization
- Goal: Remove hidden coupling and codify module boundaries without changing behavior.
- Scope:
  - Create `src/contracts/*` for shared schema/types.
  - Remove `caption <- ingest` direct type coupling (`src/pipeline/caption.ts:1`).
  - Keep CLI parsing/orchestration separate from pipeline domain logic.
  - Expand regression tests around refactor seams.
- Files touched:
  - `src/contracts/*`, `src/pipeline/caption.ts`, `src/pipeline/ingest.ts`, `src/index.ts`, `tests/*`, architecture docs.
- Exit condition:
  - No behavior changes; tests remain green.
  - Dependency flow follows documented boundaries.
- Dependencies:
  - Phase 4 quality gates active.

### Phase 6 — R1 Contract Freeze + Legacy Removal
- Goal: Finalize one stable R1 contract and remove migration paths.
- Scope:
  - Remove legacy `--job` and `meta.json`-primary behavior.
  - Freeze Contract v1 docs (CLI/schema/manifest) as implementation baseline.
  - Mark conflicting draft architecture guidance as out-of-scope for current R1 execution context.
- Files touched:
  - `src/index.ts`, `src/pipeline/ingest.ts`, `README.md`, `docs/FINAL_BUILD_PLAN.md`, `docs/BUILD_PLAN.md`, `REPO_CONFIGURATION_PLAN.md` note.
- Exit condition:
  - Canonical contract only.
  - Docs, tests, and runtime behavior fully aligned.
- Dependencies:
  - Operator approval for legacy removal.
  - All prior phases complete and green.

## Section 4: Implementation Order

1. Add `.nvmrc` with required Node version for current sharp line.
2. Regenerate lockfile from `package.json` and verify `npm ci` succeeds.
3. Verify `npm run build` succeeds from clean state.
4. Verify runtime dependency load: `node -e "require('sharp')"`.
5. Untrack stale build artifacts: remove `dist/` from git index.
6. Add test runner, `npm test` script, and baseline test config.
7. Add synthetic test fixture generator for photo inputs (no committed media binaries).
8. Add baseline integration tests for current CLI behavior (`--job` required/missing/error/happy-path).
9. Update `README.md` to accurate current run instructions.
10. Implement command dispatcher for `workshot run` and `workshot validate`.
11. Implement `job.json` parser with backward-compatible `meta.json` mapping.
12. Add manifest writer and include `manifest.json` in run output.
13. Switch canonical output path to `<job_dir>/output/`.
14. Add legacy `--job` adapter with explicit deprecation warning.
15. Add integration tests for canonical commands and compatibility path.
16. Add centralized path containment utility and enforce for all resolved paths.
17. Implement malformed metadata policy and tests (validate + run parity).
18. Pin sharp to exact version and regenerate lockfile.
19. Add Tier-1 determinism assertions (structure + filenames + caption bytes).
20. Add Tier-2 determinism assertion (image hash repeatability in pinned env).
21. Add CI workflow gates for install/build/test.
22. Extract shared schema/types to `src/contracts/*`; remove cross-pipeline coupling.
23. Remove legacy `--job` and legacy metadata path after operator sign-off.
24. Freeze R1 Contract v1 in docs and finalize deprecation notes.

## Section 5: Test Strategy

### Tests per phase
- Phase 1:
  - install/build smoke tests,
  - baseline CLI integration tests on existing behavior.
- Phase 2:
  - `run`/`validate` canonical flow,
  - schema compatibility (`job.json` and `meta.json` bridge),
  - manifest presence/shape checks.
- Phase 3:
  - path containment negatives,
  - malformed metadata policy behavior,
  - parity tests ensuring `validate` and `run` share core validation outcomes.
- Phase 4:
  - determinism tiers,
  - CI gate enforcement.
- Phase 5:
  - regression tests around contract/type refactor.
- Phase 6:
  - legacy mode removal tests and clear failure messaging for deprecated commands.

### Determinism boundary
- Tier 1 (required everywhere):
  - deterministic artifact naming,
  - expected manifest schema and references,
  - expected image dimensions/layout invariants,
  - caption text byte-identical for same input.
- Tier 2 (required on pinned environment only):
  - image artifact hash identical across repeat runs with same OS + Node + exact lockfile.
- Re-baseline rule:
  - Tier-2 baselines are updated only when dependency pin changes are approved.

### Golden test cases
- Valid minimal job with before/after and minimal `job.json`.
- Valid job with optional metadata fields populated.
- Backward compatibility: valid legacy `meta.json` job without `job.json`.
- Missing `before` media.
- Missing `after` media.
- Ambiguous media matches.
- Invalid metadata JSON.
- Missing required CLI arguments.
- Path traversal/path-escape attempt.
- Both layouts (`side-by-side`, `stacked`).
- Manifest integrity (artifact paths, hashes, caption entries, requested targets).

### CI gates
- `npm ci`
- `npm run build`
- `npm test`
- Optional hard gate once configured: `npm run lint`, `npm run typecheck`

## Section 6: Architectural Guardrails

- `src/cli/` owns command parsing/dispatch only.
- `src/pipeline/` owns processing logic only; no CLI parsing in pipeline modules.
- Shared contracts (`job.json` schema, manifest schema, caption model) live in `src/contracts/` only.
- Pipeline modules must not import each other's internal types (`src/pipeline/caption.ts:1` is migration debt to remove).
- All filesystem path resolution uses centralized safety helpers.
- Reads are constrained to `<job_dir>` and writes to `<job_dir>/output`.
- `validate` and `run` must share validation primitives; no duplicate validation logic branches.
- Determinism-affecting output options are centralized constants and covered by tests.
- Manifest output is mandatory for every successful run.
- R1 stays photo-only, but contracts/types use `media` terminology where possible to avoid image-only lock-in.
- No R2+ behavior (intake, publishing, SMS sending, video processing) is implemented in R1.

## Section 7: Forward Compatibility Notes

- `workshot run <job_dir>` + portable folder units directly supports future intake workers that create jobs outside repo-root (`docs/BUILD_PLAN.md:15`, `src/index.ts:70`).
- `job.json` v1 optional fields reserve schema space for customer/business owner/contact/channel metadata without forcing R1 behavior changes.
- `manifest.json` gives future publish services deterministic machine-readable inputs (artifacts, captions, targets, hashes) without scraping filenames.
- Caption model keyed by platform allows adding per-platform generation rules later without replacing R1 generic caption pipeline.
- `media` terminology in contracts lowers migration cost for future video support while keeping R1 photo-only implementation.
- Acceptable R1 shortcut: single media pair processing remains in runtime despite schema supporting `pairs[]`; this is acceptable because the schema already models multiplicity and can be activated later without breaking existing jobs.
- Acceptable R1 shortcut: platform-specific captions are represented as `not_generated` fallback entries; this preserves output contract shape for R2 publishers.

## Section 8: Open Decisions for Operator

1. Should malformed `job.json`/`meta.json` be fail-fast or warning-and-continue for R1 (`src/pipeline/ingest.ts:82`)?
2. Deprecation window length for `--job <name>` compatibility before removal.
3. Whether to require `job.json` immediately in R1 or keep one-release compatibility bridge from `meta.json`.
4. Whether to keep tree-specific caption copy fixed for R1 or allow operator-defined template text in `job.json`.
5. Which platforms should appear by default in manifest `captions.platform` when no explicit targets are supplied.
6. Whether CI should run Tier-2 byte-level determinism on a single pinned runner as blocking, or keep Tier-2 as non-blocking diagnostic initially.
