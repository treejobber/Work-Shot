# WorkShot Codex Build Plan

Date: 2026-02-10  
Purpose: Recovery + continuation architecture plan based on current repository state.

## SECTION 1 - CANONICAL CONTRACT DECISION

Decision: adopt a single canonical contract now (Contract v1), keep backward compatibility briefly, then remove drift paths.

1. Canonical CLI contract
- `workshot run <job_dir> [--layout side-by-side|stacked]`
- `workshot validate <job_dir>`
- Exit `0` on success, non-zero on validation/processing failure.
- Rationale: aligns with declared roadmap direction (`docs/BUILD_PLAN.md:15`) while staying close to existing runtime (`src/index.ts:17`).

2. Canonical job structure

```text
<job_dir>/
  before.jpg|before.jpeg|before.png
  after.jpg|after.jpeg|after.png
  meta.json            # optional, current schema
  output/              # generated artifacts
```

- Keep current filename-based single-pair model from implementation (`src/pipeline/ingest.ts:15`).
- Keep current `meta.json` schema (`service`, `notes`) from implementation (`src/pipeline/ingest.ts:4`).

3. Canonical output layout
- `<job_dir>/output/before_after.png`
- `<job_dir>/output/caption.txt`
- Rationale: removes hard coupling to repo-root `jobs/` + `out/` (`src/index.ts:70`, `src/index.ts:71`) and makes job folders portable.

4. Deprecated (explicit)
- `--job <name>` + implicit `jobs/<name>` and `out/<name>` roots (`src/index.ts:25`, `src/index.ts:70`).
- README quick-start that implies `npm start` without required runtime args (`README.md:10` vs `src/index.ts:54`).
- `job.json` + `before/after/` subfolder contract as an active R1 requirement (`docs/BUILD_PLAN.md:18`, `docs/BUILD_PLAN.md:19`); keep as future extension proposal only.

5. Stable contract going forward
- Single pair per job for v1.
- No network calls in v1 (`docs/BUILD_PLAN.md:40`).
- Deterministic output contract is mandatory (`docs/BUILD_PLAN.md:37`).
- Any contract change requires simultaneous updates to CLI help, README, tests, and `docs/BUILD_PLAN.md`.

## SECTION 2 - PHASED BUILD PLAN

### Phase 1 - Reproducibility + onboarding
- Goal: clean clone must install, build, and run predictably.
- Scope: dependency/lock reconciliation, script hygiene, onboarding docs.
- Files/modules touched: `package.json`, `package-lock.json`, `tsconfig.json`, `README.md`, optional `.nvmrc`.
- Risks: native dependency (`sharp`) install variance across environments.
- Validation criteria: `npm ci` succeeds; `npm run build` succeeds; documented command path works on fresh clone.
- Exit condition: one documented bootstrap path works without manual fixes.

### Phase 2 - Spec/implementation alignment
- Goal: runtime behavior matches one canonical contract.
- Scope: implement `run` + `validate` CLI shape; route output to `<job_dir>/output`; maintain temporary compatibility shim for old flags.
- Files/modules touched: `src/index.ts`, new `src/cli/*`, `src/pipeline/ingest.ts`, `README.md`, `docs/BUILD_PLAN.md`.
- Risks: breaking existing local scripts using `--job`.
- Validation criteria: both canonical commands pass acceptance checks; deprecation warnings for old path; docs match behavior.
- Exit condition: no ambiguity between docs and executable interface.

### Phase 3 - Safety hardening
- Goal: prevent unsafe path handling and silent bad-input behavior.
- Scope: path containment checks, stricter validation errors, malformed metadata policy, safer write pattern.
- Files/modules touched: `src/index.ts`, `src/pipeline/ingest.ts`, new `src/lib/pathSafety.ts` (or equivalent).
- Risks: stricter checks may reject previously tolerated jobs.
- Validation criteria: negative tests for traversal, malformed JSON, ambiguous/missing files; all fail with actionable errors.
- Exit condition: tool cannot read/write outside intended job scope via user input.

### Phase 4 - Determinism + quality gates
- Goal: enforce deterministic outputs and block regressions.
- Scope: deterministic image/caption behavior tests, typecheck/lint/test CI gating.
- Files/modules touched: `src/pipeline/compose.ts`, `src/pipeline/caption.ts`, `tests/*`, `.github/workflows/*`, `package.json`.
- Risks: image-byte determinism may vary by platform/libvips version.
- Validation criteria: repeated-run determinism test passes; CI blocks merges on failing checks.
- Exit condition: determinism is tested and enforced automatically.

### Phase 5 - Architecture stabilization
- Goal: reduce hidden coupling and clarify boundaries.
- Scope: extract shared contracts/types; remove cross-module schema leakage.
- Files/modules touched: new `src/contracts/*`, `src/pipeline/caption.ts`, `src/pipeline/ingest.ts`, `src/index.ts`.
- Risks: refactor regressions without behavior intent.
- Validation criteria: no CLI behavior change; tests unchanged and green; dependency direction is one-way via contracts.
- Exit condition: module responsibilities are explicit and documented.

### Phase 6 - Extensibility groundwork
- Goal: prepare safe extension points without shipping major new features.
- Scope: pairing/layout strategy interfaces, schema version field, extension docs.
- Files/modules touched: `src/contracts/*`, `src/pipeline/*`, `docs/BUILD_PLAN.md`, new architecture notes.
- Risks: over-design before need.
- Validation criteria: default behavior unchanged; at least one alternate strategy can be wired without touching orchestration core.
- Exit condition: future features can be added by module extension, not contract churn.

## SECTION 3 - PRIORITY FIX LIST

### Must fix before any new features
1. Dependency + lockfile integrity
- Why: current manifests are inconsistent (`package.json:10`, `package-lock.json:10`).
- Consequence if ignored: non-reproducible installs/build failures.
- Complexity: Low.

2. Canonical CLI/doc mismatch
- Why: runtime and docs currently disagree (`docs/BUILD_PLAN.md:15`, `src/index.ts:17`).
- Consequence if ignored: onboarding friction and recurring integration mistakes.
- Complexity: Medium.

3. Path safety for user-supplied job path/name
- Why: current path join permits boundary escape patterns (`src/index.ts:72`).
- Consequence if ignored: unintended filesystem read/write risk.
- Complexity: Medium.

4. Build correctness gate
- Why: build should fail reliably before emitting deployable artifacts.
- Consequence if ignored: stale/invalid `dist` output can mask source errors.
- Complexity: Low.

### Should fix soon
1. Implement `validate` command
- Why: explicitly planned (`docs/BUILD_PLAN.md:16`) and needed for safe operator workflow.
- Consequence if ignored: failures found too late during write path.
- Complexity: Medium.

2. Malformed metadata handling policy
- Why: current silent nulling (`src/pipeline/ingest.ts:83`) hides data issues.
- Consequence if ignored: silent quality degradation.
- Complexity: Low.

3. Determinism test harness + CI gates
- Why: determinism is a stated requirement (`docs/BUILD_PLAN.md:37`) with no enforcement today.
- Consequence if ignored: regressions and unpredictable outputs.
- Complexity: Medium.

4. Module contract decoupling
- Why: caption imports ingest types directly (`src/pipeline/caption.ts:1`).
- Consequence if ignored: schema changes ripple across modules.
- Complexity: Low.

### Can defer safely
1. Multi-pair job model
- Why: current implementation is single-pair and working model is not yet stabilized.
- Consequence if ignored: limited throughput, but no immediate correctness risk.
- Complexity: High.

2. R2+ intake/automation infrastructure
- Why: explicitly out of current MVP scope (`docs/BUILD_PLAN.md:44`).
- Consequence if ignored: slower expansion, but core stability improves first.
- Complexity: High.

## SECTION 4 - TEST STRATEGY

1. What must be tested for determinism
- Same input job run twice yields identical output filenames and file hashes.
- Caption output is byte-identical for same `meta.json`.
- Layout rendering is stable for both `side-by-side` and `stacked`.

2. Golden test cases
- Valid minimal job with `before`/`after`, no meta.
- Valid job with `meta.json`.
- Missing `before`.
- Missing `after`.
- Ambiguous matches (for example both `before.jpg` and `before.png`).
- Invalid `meta.json`.
- Traversal/path escape attempt.
- Deprecated CLI path (during deprecation window) emits warning.

3. How image composition should be validated
- Prefer generated synthetic input images in tests (not committed media assets).
- Assert output dimensions, panel ordering, and deterministic hash.
- Assert label overlays exist at expected region/pixels.
- Run twice in same CI job and compare hashes.

4. CI gates that should exist
- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm test` (unit + integration + determinism)
- Fail merge if any gate fails.

5. What must never regress
- No writes outside target job directory.
- Canonical CLI contract behavior and exit codes.
- Deterministic output naming and content.
- No silent acceptance of ambiguous/missing required inputs.
- No network calls in v1 pipeline.

## SECTION 5 - ARCHITECTURAL GUARDRAILS

- `src/cli/` owns argument parsing and command dispatch only.
- `src/pipeline/` owns domain processing; it must not parse CLI args.
- `src/contracts/` is the only place for shared job/caption schema types.
- `caption` must not import from `ingest`; both import from `contracts`.
- Filesystem root resolution and path safety checks must be centralized in one utility.
- Any output write path must pass containment validation against `<job_dir>`.
- Deterministic settings (encoder options, sorting, metadata handling) must be constants, not ad-hoc per call.
- Contract changes require same-PR updates to docs + tests + CLI help text.
- New features must be additive modules, not edits across all pipeline files.
- No feature may bypass validation; `validate` and `run` must share the same validation logic.

## SECTION 6 - IMPLEMENTATION ORDER

1. Add `.nvmrc` (or equivalent runtime pin) and document Node version in `README.md`.
2. Reconcile `package.json` and `package-lock.json`; verify `npm ci` from clean state.
3. Add `typecheck` script and enforce build failure on type errors.
4. Update README quick-start to a runnable command with explicit job path argument.
5. Introduce `run` command surface in CLI while preserving old flags behind deprecation warning.
6. Add `validate` command that performs all preflight checks without writing files.
7. Move output target from repo-root `out/` to `<job_dir>/output/` in run path.
8. Add path normalization + containment checks for all user-provided paths.
9. Define malformed metadata policy and implement explicit warning/error behavior.
10. Add integration tests for `validate` error scenarios (missing/ambiguous/invalid inputs).
11. Add integration tests for `run` happy paths for both layouts.
12. Add deterministic repeat-run test asserting identical hashes for outputs.
13. Add generated-image composition tests (dimension + panel placement + label presence).
14. Add CI workflow with `npm ci`, typecheck, lint, test gates.
15. Extract shared contracts into `src/contracts/` and update pipeline imports.
16. Document module boundaries and contract version in a short architecture note.
17. Remove deprecated `--job` path after one release cycle and update docs/tests accordingly.
18. Freeze Contract v1 in docs and treat further changes as explicit versioned decisions.
