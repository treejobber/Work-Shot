# WorkShot Architecture Recon Report

Date: 2026-02-10  
Scope: Full repository reconnaissance (no code modifications)

## SECTION 1 — SYSTEM PURPOSE

1. What is the apparent end goal of this repository?  
A local CLI that turns before/after job photos into a composite image plus caption for social posting (`README.md:3`, `docs/BUILD_PLAN.md:7`, `src/index.ts:93`, `src/index.ts:109`).

2. What real-world problem is it trying to solve?  
Reduce manual effort for small field-service before/after marketing workflows by generating standardized visual outputs and captions (`src/pipeline/caption.ts:11`, `jobs/_example/meta.json:2`, `jobs/_example/README.md:7`).

3. What type of system is this? (app, framework, engine, automation pipeline, etc.)  
Single-process CLI app / local automation pipeline in TypeScript/Node (`package.json:6`, `package.json:7`, `src/index.ts:65`).

4. Who is the intended user/operator?  
An internal operator running jobs locally (not external end users) (`README.md:3`, `PHASE_R0_REPO_HARDENING_PLAN.md:23`).

5. What stage is the project in? (prototype / mid-build / production-ready / research)  
Prototype to early mid-build (uncertain, leaning prototype). Evidence: one commit history baseline, roadmap beyond current implementation, and incomplete hardening/governance footprint (`docs/BUILD_PLAN.md:64`, `REPO_CONFIGURATION_PLAN.md:26`).

If the goal is unclear, competing hypotheses:
- H1: Local-only MVP photo compositor (current code reality).
- H2: Seed for a larger intake/automation platform (roadmap intent).
- H3: Also a process/governance sandbox for operator-gated AI workflows (`docs/WORKSHOT_PROMPT_DOCTRINE.md:17`, `PHASE_R0_REPO_HARDENING_PLAN.md:56`).

## SECTION 2 — HIGH LEVEL ARCHITECTURE

1. Describe the system architecture at a high level.  
Monolithic CLI orchestrator (`src/index.ts`) invoking three pipeline modules: ingest, compose, caption.

2. Identify major subsystems or layers.
- CLI orchestration: `src/index.ts`
- Input validation + metadata parsing: `src/pipeline/ingest.ts`
- Image composition engine: `src/pipeline/compose.ts`
- Caption templating: `src/pipeline/caption.ts`
- Runtime state boundaries: `jobs/`, `out/`
- Build layer: TypeScript -> `dist/` via `tsconfig.json`

3. Explain how data flows through the system.
- Parse CLI args (`--job`, `--layout`) (`src/index.ts:17`).
- Resolve `jobs/<job>` and `out/<job>` (`src/index.ts:70`).
- Ingest validates required images and optional metadata (`src/pipeline/ingest.ts:91`).
- Compose reads input images, normalizes/resizes/labels, writes `before_after.png` (`src/pipeline/compose.ts:63`, `src/index.ts:94`).
- Caption generates deterministic text from metadata and writes `caption.txt` (`src/pipeline/caption.ts:7`, `src/index.ts:109`).

4. Identify entry points (CLI, API, scripts, UI, schedulers, etc.).
- `npm run build` -> `tsc` (`package.json:6`)
- `npm start` -> build + run `node dist/index.js` (`package.json:7`)
- Runtime flags parsed in `src/index.ts`

5. Identify persistent state (DBs, files, logs, caches).
- Input files under `jobs/<job>/`
- Output files under `out/<job>/`
- Build artifacts under `dist/`
- No DB, cache, or scheduler detected

Simplified architecture diagram (text):

```text
Operator CLI
  -> src/index.ts (arg parse + orchestration)
     -> ingest.ts (validate files + parse meta.json)
     -> compose.ts (sharp image processing)
     -> caption.ts (template text generation)
  -> writes out/<job>/before_after.png
  -> writes out/<job>/caption.txt
```

## SECTION 3 — MODULE MAP

### `src/`
- Purpose: Main application source.
- Responsibilities: End-to-end orchestration and pipeline composition.
- Key files: `src/index.ts`
- Dependencies: Node runtime, internal pipeline modules.
- Relied on by: `dist/` runtime output.
- Stability guess: Core, actively evolving.

### `src/pipeline/ingest.ts`
- Purpose: Input contract enforcement.
- Responsibilities: Validate job folder, find required images, parse optional metadata.
- Key files: `src/pipeline/ingest.ts`
- Dependencies: `fs`, `path`.
- Relied on by: `src/index.ts`; `src/pipeline/caption.ts` (type import).
- Stability guess: Core.

### `src/pipeline/compose.ts`
- Purpose: Image processing/composition.
- Responsibilities: Resize panels, apply labels, render side-by-side/stacked composite.
- Key files: `src/pipeline/compose.ts`
- Dependencies: `sharp`.
- Relied on by: `src/index.ts`.
- Stability guess: Core but fragile due external dependency/runtime setup.

### `src/pipeline/caption.ts`
- Purpose: Deterministic caption generation.
- Responsibilities: Build caption string from `JobMeta`.
- Key files: `src/pipeline/caption.ts`
- Dependencies: `JobMeta` from ingest.
- Relied on by: `src/index.ts`.
- Stability guess: Core.

### `jobs/`
- Purpose: Local job input workspace.
- Responsibilities: Hold per-job images and optional metadata.
- Key files: `jobs/_example/README.md`, `jobs/_example/meta.json`
- Dependencies: Filesystem.
- Relied on by: Ingest pipeline.
- Stability guess: Core runtime boundary.

### `out/`
- Purpose: Generated output workspace.
- Responsibilities: Store rendered composite + caption artifacts.
- Key files: `out/.gitkeep`
- Dependencies: Filesystem.
- Relied on by: Orchestration output path.
- Stability guess: Core runtime boundary.

### `docs/` + root planning docs
- Purpose: Roadmap, governance, operator workflow doctrine.
- Responsibilities: Describe intended phases and process constraints.
- Key files: `docs/BUILD_PLAN.md`, `docs/WORKSHOT_PROMPT_DOCTRINE.md`, `PHASE_R0_REPO_HARDENING_PLAN.md`, `REPO_CONFIGURATION_PLAN.md`
- Dependencies: None (documentation only).
- Relied on by: Human operators and implementers.
- Stability guess: Strategic but partially stale vs implementation.

How modules connect:
- `src/index.ts` imports ingest, compose, caption directly (`src/index.ts:2`, `src/index.ts:3`, `src/index.ts:4`).
- `caption.ts` imports `JobMeta` from ingest (`src/pipeline/caption.ts:1`), coupling caption schema to ingest schema.
- No plugin boundary, adapter layer, or inversion-of-control boundary found.

## SECTION 4 — EXECUTION MODEL

1. How is this system meant to run?  
As a local Node CLI after TypeScript transpilation (`package.json:6`, `package.json:7`).

2. What is the main runtime loop or orchestration logic?  
Single run path: parse args -> ingest -> create output dir -> compose image -> generate caption -> exit (`src/index.ts:65` onward).

3. What scripts or commands are considered canonical entry points?
- Declared scripts: `npm run build`, `npm start`
- Runtime invocation shape: `node dist/index.js --job <jobName> [--layout side-by-side|stacked]` (`src/index.ts:56`)

4. What happens first when the system starts?  
`main()` executes immediately (`src/index.ts:122`), then argument parsing validates required `--job` (`src/index.ts:54`).

5. What are the critical execution paths?
- Success path through all four pipeline steps (`src/index.ts:75`, `src/index.ts:84`, `src/index.ts:93`, `src/index.ts:108`).
- Failure paths use hard exits with `process.exit(1)` on validation, ingest, compose, and write failures.

## SECTION 5 — DATA + STATE

1. What data structures are central to the system?
- `Args` (`job`, `layout`) (`src/index.ts:9`)
- `Layout` union type (`src/pipeline/compose.ts:3`)
- `JobMeta` (`service`, `notes`) (`src/pipeline/ingest.ts:4`)
- `IngestResult` (`beforePath`, `afterPath`, `meta`) (`src/pipeline/ingest.ts:9`)

2. What formats are used? (JSON, DB, flat files, etc.)
- JSON: `meta.json`
- Input images: `.jpg/.jpeg/.png`
- Output image: `.png`
- Output caption: `.txt`

3. Where is state stored?
- Input state: `jobs/`
- Output state: `out/`
- Build state: `dist/`
- Dependency state: `node_modules/` and lockfile

4. What components read/write shared state?
- Ingest reads job directory and metadata (`src/pipeline/ingest.ts`).
- Compose reads images and writes composite (`src/pipeline/compose.ts`).
- Orchestrator creates directories and writes caption (`src/index.ts:86`, `src/index.ts:112`).

5. Any risk of race conditions or corruption?
- Moderate overwrite risk when concurrent runs target same job/output names (`before_after.png`, `caption.txt`).
- No locking or atomic write strategy detected.

## SECTION 6 — GOVERNANCE + CONVENTIONS

1. Naming conventions
- CLI flags use kebab-case (`--job`, `--layout`).
- Input file patterns are strict (`before.*`, `after.*`).
- Output names are fixed.

2. Folder structure philosophy
- Local-first filesystem workflow (`README.md:15` to `README.md:18`).
- Input/output artifacts are intended to stay out of git (`.gitignore:1` to `.gitignore:7`).

3. Code style patterns
- TypeScript strict mode enabled (`tsconfig.json:7`).
- Small focused modules with explicit interfaces.
- Mix of sync fs operations and async orchestration.

4. Testing strategy
- No test files found.
- No test script in `package.json`.
- CI and enforcement are planned in docs but not present in current tree.

5. Documentation quality
- Strong strategic planning docs exist.
- Doc-code mismatch is material:
  - Planned `workshot run|validate` vs implemented `--job` flow.
  - Planned `job.json` + `before/after/` subfolders vs implemented flat `before.*`/`after.*` with `meta.json`.

6. Any implicit rules the repo seems to enforce
- Deterministic local-first processing is intended (`docs/BUILD_PLAN.md:37`, `docs/BUILD_PLAN.md:40`).
- Operator authority and critique gate are explicit process rules (`docs/WORKSHOT_PROMPT_DOCTRINE.md:26`, `PHASE_R0_REPO_HARDENING_PLAN.md:23`).

## SECTION 7 — RISK ANALYSIS

- Fragile area: build/runtime reproducibility.
  - Declared dependencies and lock/install state are not aligned in this snapshot, causing build/runtime failures.
- Fragile area: artifact trust.
  - `dist/` may contain stale or partially emitted output while source evolves.
- Incomplete modules:
  - Roadmapped `validate` command and richer job schema are not implemented.
  - Planned repo governance/CI structure is largely absent from filesystem.
- Hidden coupling:
  - Caption schema is coupled to ingest schema via type import.
  - Paths and filenames are hardcoded in orchestrator.
- Missing abstractions:
  - No dedicated domain contract module for job schema and pipeline contracts.
  - No adapter abstraction for filesystem/image backend.
- Technical debt:
  - Significant divergence between roadmap docs and executable behavior.
  - README quick-start omits required runtime argument.
- Likely future bottlenecks:
  - Single-pair job assumption.
  - Hardcoded local path structure.
  - Lack of tests and CI gates for deterministic outputs.

## SECTION 8 — OPEN QUESTIONS

1. What is the authoritative job contract: flat folder + `meta.json`, or `job.json` with `before/after` directories?
2. What is the canonical CLI interface: `workshot run|validate` or current flag-driven invocation?
3. Should missing/invalid metadata be tolerated silently, warned, or treated as hard failure?
4. Is single before/after pair per job a deliberate long-term constraint or a temporary simplification?
5. What determinism guarantees are mandatory and how will they be verified in tests?
6. What minimum hardening from `REPO_CONFIGURATION_PLAN.md` is in immediate scope vs deferred?
7. Is `dist/` considered disposable local output only, and should TS emit be blocked on type errors?
8. How and when does this repository transition from local CLI to intake/automation architecture?

## SECTION 9 — RECOMMENDED NEXT STEPS

1. What should be stabilized first?
- Lock the runtime contract: dependency install reproducibility, canonical run command, and source-of-truth build behavior.
- Freeze one authoritative CLI + job schema for R1 and update all docs to match.

2. What should be documented?
- A concise runtime contract doc: required input files, command syntax, output guarantees.
- A determinism contract doc: what must remain stable across re-runs.

3. What should be refactored?
- Extract a shared job contract/validation module to reduce implicit coupling.
- Centralize path/output conventions instead of scattering constants in orchestration.
- Introduce explicit error categories for validation vs processing vs IO.

4. What architectural plan should be created next?
- A narrow “R1 Hardening Plan” focused on contract convergence, reproducible local execution, and baseline test coverage for ingest/compose/caption.
- Sequence future intake/automation work only after R1 contract stability is achieved.
