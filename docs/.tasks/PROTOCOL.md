# Task Queue Protocol (Codex <-> Claude Code)

## 1) Purpose
Lightweight, file-based handoff between:
- `IMPLEMENTER` (Claude Code): asks architecture questions.
- `ARCHITECT` (Codex): answers and unblocks execution.
- `OPERATOR`: final authority for escalations.

## 2) Files and Ownership
- `docs/.tasks/QUEUE.md`
  - Owner: `IMPLEMENTER`
  - Use: open tasks and task status updates
- `docs/.tasks/DECISIONS.md`
  - Owner: `ARCHITECT`
  - Use: decisions/responses for task IDs

Rule: one writer per file to avoid merge/edit conflicts.

## 3) Task Entry Schema (QUEUE.md)
Each task is a section with this minimum shape:

```md
## TASK-###
- status: PENDING | RESOLVED | ESCALATE_TO_OPERATOR
- created_at_utc: YYYY-MM-DDTHH:MM:SSZ
- created_by: claude-code
- type: ARCH_DECISION | AMBIGUITY | RISK | UNBLOCKER
- priority: P0 | P1 | P2
- deadline_utc: YYYY-MM-DDTHH:MM:SSZ | none
- question: <single clear question>
- context: <short implementation context>
- options:
  1. <option A>
  2. <option B>
- refs:
  - <path:line>
```

## 4) Response Schema (DECISIONS.md)
Architect replies with one section per task:

```md
## TASK-### (RESOLVED | ESCALATE_TO_OPERATOR)
- decided_at_utc: YYYY-MM-DDTHH:MM:SSZ
- decided_by: codex
- decision: <chosen option / directive>
- rationale: <short reason tied to repo evidence>
- required_actions:
  1. <implementer action>
  2. <implementer action>
```

## 5) Lifecycle Rules
1. Implementer appends task in `QUEUE.md` with `status: PENDING`.
2. Architect appends matching decision in `DECISIONS.md`.
3. Implementer updates queue task status:
   - `PENDING -> RESOLVED` after applying decision, or
   - `PENDING -> ESCALATE_TO_OPERATOR` if architect escalates.
4. Architect does not edit `QUEUE.md`; implementer does not edit architect entries in `DECISIONS.md`.

## 6) Multiple Pending Tasks
- Process order: `priority` first (`P0 > P1 > P2`), then FIFO by task ID.
- Architect may batch responses in one update, but each task must get its own response block.

## 7) Conflict Avoidance
- Append-only entries; do not rewrite historical task/decision text.
- Do not reuse task IDs.
- Implementer should pull/rebase before writing `QUEUE.md`.
- Architect should pull/rebase before writing `DECISIONS.md`.

## 8) Triggering Model (Practical)
Codex cannot self-trigger outside an active session. Reliable trigger is:
- Implementer writes/pushes queue updates.
- Operator (or implementer in chat) sends a short nudge: `Check docs/.tasks/QUEUE.md and answer all PENDING tasks.`

Optional hygiene:
- Always check queue at start of an architect session before other work.
