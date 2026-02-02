# Phase R0 — Repo Hardening & Workflow Contract

Status: Approved  
Goal: Enable fast iteration with minimal guardrails that prevent catastrophic mistakes.

This document defines how GPT, Claude, and the Operator interact.
It is intentionally lightweight.

---

## Core Principles

- Speed over ceremony
- Human authority over automation
- Minimal governance
- Repo is working memory, not truth
- Stop early instead of spiraling

---

## Authority Model

The Operator is the final authority.

Operator instructions override:
- repo docs
- prompts
- model output
- prior decisions

Authority may be explicitly delegated inside an Implementation Brief.

No model acts without Operator approval.

---

## Sensitive Data Rule

Never paste into GPT or Claude:

- API keys
- credentials
- customer names
- phone numbers
- media files
- webhook payloads
- raw production logs

Only sanitized examples are allowed.

If real data is required:
models must stop and request a safe substitute.

---

## GPT ↔ Claude Workflow

Loop:

Operator → GPT → Implementation Brief → Claude → Report → Operator

### GPT role

GPT produces an **Implementation Brief** containing:

- goal
- constraints
- out-of-scope
- acceptance criteria
- likely touch-points
- risks
- questions

No implementation.
No file generation.

### Claude role

Claude implements only what the approved Brief authorizes.

If ambiguity exists:
Claude stops and asks.

Claude never expands scope.

---

## Human Gate Rules

Gate 1:
Claude does not start until Operator approves the Brief.

Gate 2:
No destructive actions, merges, releases, or sharing
without explicit Operator approval.

Human review is mandatory.

---

## Claude Reporting Contract

Claude must return:

- what changed (high level)
- file list
- verification performed
- remaining risks
- next-step questions

Reports must be readable by a human in under 1 minute.

---

## Repo Memory Rule

Docs are guidance, not truth.

If a doc conflicts with reality:
update it immediately.

Memory docs may only be updated when Operator requests.

Each entry must include:

- date
- owner
- scope
- what it supersedes

---

## Staleness Rule

If repo memory conflicts with the current task:

treat it as stale and escalate to Operator.

Models never silently reconcile contradictions.

---

## Stop Rule

If a task:

- exceeds expected runtime
- expands beyond scope
- becomes confusing
- generates excessive output

Claude or GPT must stop and ask:

“What are we actually trying to do?”

Early stopping is a feature, not a failure.

---

End of Phase R0 Contract.
