# Sub-Agent Prompt Template

Use this template when spawning sub-agents via the Task tool for multi-step implementation work. Fill in all fields before dispatching.

## Template

```
ROLE: <specific role — e.g., "test writer", "module implementer", "code reviewer">
GOAL: <single sentence — what this sub-agent accomplishes>
SCOPE: <specific files/modules this agent touches — be explicit>

CURRENT STATE:
- <repo state relevant to this subtask>
- <decisions already made that affect this work>
- <dependencies installed, build status, test status>

CONSTRAINTS:
- <what this agent must NOT change>
- <phase boundaries — do not implement Phase N+1 features>
- <style/convention requirements>

DELIVERABLES:
- <concrete output 1 with acceptance criteria>
- <concrete output 2 with acceptance criteria>

EXIT CONDITIONS:
- <verifiable command or check that proves success>

STOP AFTER DELIVERABLES.
```

## Rules

1. **Every field is required.** Sub-agents start with clean context — missing fields cause incorrect assumptions.
2. **SCOPE must list specific files.** Don't say "the pipeline" — say `src/pipeline/ingest.ts`, `src/pipeline/compose.ts`.
3. **CURRENT STATE must include build status.** The sub-agent needs to know if `npm run build` and `npm test` currently pass.
4. **CONSTRAINTS must include phase boundaries.** Sub-agents tend to "helpfully" implement future work.
5. **EXIT CONDITIONS must be verifiable.** Use commands: `npm test`, `npm run build`, file existence checks, git status.
6. **STOP is mandatory.** Explicitly state what the agent must not do.

## Example

```
ROLE: test writer
GOAL: Add integration tests for the validate command error paths
SCOPE: tests/cli.test.ts, tests/fixtures.ts

CURRENT STATE:
- Phase 2 contract migration complete
- `workshot validate <job_dir>` is implemented in src/cli/validate.ts
- npm run build passes, npm test passes (5 existing tests)
- job.json schema is defined in src/contracts/job.ts

CONSTRAINTS:
- Do not modify source files — tests only
- Do not add new dependencies
- Tests must use the synthetic fixture generator (no committed binaries)

DELIVERABLES:
- Tests for: missing job.json, invalid JSON, missing required fields, valid job passes
- All tests pass via `npm test`

EXIT CONDITIONS:
- `npm test` passes with 0 failures
- New test count is >= 9 (5 existing + 4 new)

STOP AFTER DELIVERABLES.
Do not implement Phase 3 path safety features.
```
