# WorkShot — Claude Code Firmware

## Project State

WorkShot is a local CLI tool for before/after photo composition and caption generation for tree service businesses. TypeScript + Node.js + sharp. R1 scope: local pipeline only.

**Current phase:** Phase 6 COMPLETE — R1 Contract Freeze + Legacy Removal
**Status:** All 6 R1 phases complete. Canonical-only contract.

### Phase 6 decisions
- Legacy `--job` CLI flag removed (now returns "Unknown flag" error)
- `meta.json` bridge removed — `job.json` is required for all jobs
- `jobs/_example/` canonicalized with `job.json` (meta.json deleted)
- `IngestResult.metaSource` narrowed to `"job.json"` only
- `checkMetaJson()` and `makeDefaultJobJson()` removed from ingest.ts
- `assertContainedIn` removed from index.ts (was only used by legacy --job)
- 55 tests passing (35 CLI + 9 determinism + 11 seam regression)

### File map
| File | Heat | Notes |
|------|------|-------|
| `src/index.ts` | COLD | Thin orchestration entrypoint (canonical only) |
| `src/cli/parseArgs.ts` | COLD | CLI parsing: `run` and `validate` only |
| `src/contracts/types.ts` | COLD | Shared types (frozen R1 contract) |
| `src/pipeline/ingest.ts` | COLD | Validation primitives, job.json required |
| `src/pipeline/manifest.ts` | COLD | Manifest writer |
| `src/pipeline/compose.ts` | COLD | Image compositor, explicit PNG settings |
| `src/pipeline/caption.ts` | COLD | Caption generator |
| `src/lib/pathSafety.ts` | COLD | Path containment + filename safety |
| `tests/cli.test.ts` | COLD | 35 integration tests |
| `tests/determinism.test.ts` | COLD | Tier-1 + Tier-2 determinism (9 tests) |
| `tests/seams.test.ts` | COLD | Boundary + legacy removal regression (11 tests) |
| `tests/fixtures.ts` | COLD | Synthetic fixture generator |
| `.github/workflows/ci.yml` | COLD | CI quality gates |
| `package.json` | COLD | sharp pinned to 0.33.5 |

## Governance

- **YOU MUST** escalate architectural decisions to operator (Scott)
- **YOU MUST** use `/spawn-agent` when spawning sub-agents for multi-step work
- **IMPORTANT:** Use `/clear` between major tasks to reset context attention
- **IMPORTANT:** R1 contract is frozen. Do not change CLI surface, schema, or output format without operator approval
- Authority: you may choose tooling, file layout, and routine implementation details
- Stop: if you encounter a design ambiguity that affects the public contract, ask the operator

## References

- @docs/FINAL_BUILD_PLAN.md — Phase details, implementation order, test strategy
- @docs/AGENTIC_SYSTEM_DESIGN.md — Agent roles, communication protocol, prompt templates
- @docs/OPUS_CRITIQUE.md — Critical review findings and resolutions

## Canary

End status reports with: `-- WorkShot`
