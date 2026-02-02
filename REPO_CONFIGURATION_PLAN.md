# WorkShot — Repository Configuration Plan

Status: Draft  
Owner: Scott  
Scope: Internal tool MVP  
Audience: Implementers, reviewers, automation agents  
Purpose: Define repository structure, git governance, and enforcement policies before implementation.

---

## 0. Objectives

The WorkShot repository must:

- Be deterministic and reproducible across machines
- Prevent accidental secrets or media commits
- Maintain clean git history
- Enforce lightweight but real governance
- Scale from internal tool → production product without rewrite
- Be enforceable via automation

This plan defines the minimum hardened baseline.

---

## 1. Canonical Repository Structure

```
workshot/
  apps/
    api/
  packages/
    core/
  docs/
    governance/
    runbooks/
  infra/
    docker/
  .github/
    workflows/
  .editorconfig
  .gitignore
  README.md
  SECURITY.md
  CODEOWNERS
  .env.example
```

### Invariants

The following MUST never be committed:

- Secrets (.env files, tokens, credentials)
- Media artifacts (images, uploads, collages)
- Local databases
- Temporary build output

All tooling must assume ephemeral local storage.

---

## 2. Branch Strategy

### Primary branch

`main` is always deployable.

### Feature branches

```
feat/<topic>
fix/<topic>
chore/<topic>
docs/<topic>
```

### Rules

- No direct commits to main
- All changes go through PR
- main requires green CI
- No force push to main
- Squash merge preferred

---

## 3. Commit Standards

Conventional commits REQUIRED:

```
feat: add webhook handler
fix: handle missing caption
docs: update runbook
chore: bump deps
```

Purpose:

- Enables changelog automation
- Improves traceability
- Supports semantic versioning

---

## 4. Governance Documents

All governance files live in:

```
docs/governance/
```

Required documents:

### GOVERNANCE.md
Defines roles, scope, and change control.

### DEV_WORKFLOW_CONTRACT.md
Defines merge requirements:

- tests pass
- lint passes
- env changes documented
- runbooks updated if behavior changes

### POLICY_LIBRARY.md
Central index of policies:

- P-01 Secrets Policy
- P-02 Artifact Policy
- P-03 Logging Policy
- P-04 Data Retention Policy
- P-05 External API Contracts

Each policy includes:

- purpose
- rules
- enforcement method
- exceptions

### RISK_REGISTER.md
Tracks known risks:

- webhook spoofing
- token leakage
- PII logging
- accidental sharing
- abuse traffic
- homeowner consent failures

### DECISIONS.md
Architecture decisions record:

- Node + TypeScript chosen
- SQLite for MVP
- WhatsApp intake
- messaging strategy

---

## 5. Secrets Management

Rules:

- No secrets in git
- `.env` is local only
- `.env.example` documents required vars
- Secrets rotated via runbook

Enforcement:

- pre-commit secret scanning
- CI secret scanning
- reviewer responsibility

---

## 6. Artifact Policy

The repository is code-only.

Forbidden artifacts:

- images
- uploads
- collages
- database files
- logs
- large binaries

`.gitignore` MUST include:

```
.env
.env.*
media/
uploads/
storage/
*.sqlite
*.db
node_modules/
dist/
coverage/
.DS_Store
Thumbs.db
```

Enforcement:

- pre-commit size limit
- artifact scan hook

---

## 7. Logging Policy

Logs must never include:

- full phone numbers
- addresses
- homeowner names
- raw captions
- media URLs with PII

Logs may include:

- job_id
- timestamps
- status flags

Purpose: prevent PII leakage.

---

## 8. Runtime Determinism

- Node version pinned via `.nvmrc`
- Dependency lockfile required
- Strict TypeScript mode
- ESLint + Prettier enforced

Commands:

```
npm run lint
npm run typecheck
npm run test
```

All must pass before merge.

---

## 9. CI Pipeline

GitHub Actions workflow:

- install dependencies
- lint
- typecheck
- tests

Optional future steps:

- dependency audit
- secret scan
- license scan

CI must block merges on failure.

---

## 10. Repo Protection

Main branch rules:

- require PR
- require green CI
- block force push
- require at least 1 approval

CODEOWNERS:

- Scott = default owner

---

## 11. Operational Runbooks

Located in:

```
docs/runbooks/
```

Required runbooks:

### RUNBOOK_LOCAL_DEV.md
How to run locally + ngrok webhook setup.

### RUNBOOK_TOKEN_ROTATION.md
How to rotate WhatsApp/Twilio tokens.

### RUNBOOK_INCIDENTS.md
Webhook abuse or outage procedure.

### RUNBOOK_DATA_RETENTION.md
Media cleanup policy.

---

## 12. Enforcement Mechanisms

Local enforcement:

- pre-commit secret scan
- lint staged files
- block large files
- commit message validation

CI enforcement:

- same checks as local
- cannot merge if failing

---

## 13. Implementation Order

### Phase R0 — Repo Hardening

1. Create governance docs
2. Add .gitignore and .env.example
3. Configure lint/typecheck/test
4. Add pre-commit hooks
5. Add CI workflow
6. Protect main branch

### Phase R1 — MVP build

WhatsApp intake → before/after pairing → share pack

### Phase R2 — Messaging

tap-to-send or Twilio integration

---

## 14. Guiding Principle

This repository must favor:

- safety over speed
- clarity over cleverness
- reproducibility over convenience
- automation over memory

If a rule is routinely ignored, it must be automated or removed.

No silent drift.

