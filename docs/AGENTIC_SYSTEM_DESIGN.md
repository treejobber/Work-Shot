# WorkShot Agentic System Design

Date: 2026-02-10
Status: Active design, pre-implementation (v2.2)
Context: Designed during Opus critique session, evolved through three Perplexity deep research rounds (multi-agent coordination, GitHub Actions capabilities, cross-check against real-world implementations). The automated loop is Claude-only. Codex sits outside the loop as the operator's proxy for prompt construction and architectural guidance.

## Design Evolution

1. **v1 (initial):** Codex as ARCHITECT + Claude Code as IMPLEMENTER. File-based task queue with manual nudges.
2. **v2:** Claude-only. GitHub Actions replaces manual nudges. `CLAUDE.md` provides persistent context. GitHub Issues replace file-based task queue. Codex fully removed.
3. **v2.1:** Codex re-added **outside** the automated loop as the operator's proxy. Codex builds structured prompts for Claude, answers Claude's escalations, and helps the operator navigate technical decisions. The automated system remains Claude-only. Inspired by Sigma's OIB (Outbound Instruction Block) firmware pattern. Added `AGENTS.md` as session firmware.
4. **v2.2 (current):** Cross-checked against real-world implementations via Perplexity deep research. Added CLAUDE.md compliance strategy (keep under 100 lines, use `@imports`, emphasis markers). Moved sub-agent prompt template to `.claude/commands/spawn-agent.md` for on-demand loading. Added sharp MCP servers as recommended tooling. Documented claude-code-action gotchas (permission issues, 10-turn default limit). Added Agent Teams as near-term upgrade path.

---

## 1. System Vision

WorkShot is built by three collaborators: a human operator, an AI implementer (Claude Code), and an AI advisor (Codex). Claude Code operates autonomously within the automated loop (interactive CLI + GitHub Actions). Codex sits outside the loop as the operator's proxy — helping Scott construct structured prompts, answer technical questions, and make architectural decisions that get fed to Claude. The operator sets direction and holds the final approval gate.

### The full product pipeline (for context)
1. Photos arrive via WhatsApp message from field crew
2. System creates a job automatically from the inbound message
3. Before/after photos are composited into a social-media-ready image (video later)
4. Captions are generated per platform
5. Posts are published to all major social platforms (Facebook, Instagram, Google Business Profile, TikTok, YouTube, etc.)
6. Links to the published posts are saved back to the system
7. System generates an SMS (via Twilio) to the business owner with a message containing post links
8. The business owner manually forwards this SMS to the customer
9. Eventually this becomes a standalone app

R1 implements steps 2-4 (local pipeline only). The agentic system supports the full build across all phases.

---

## 2. Agent Roles

| Role | Agent | Mode | Capabilities | Limitations |
|------|-------|------|-------------|-------------|
| **IMPLEMENTER + CRITIC** | Claude Code (Opus 4.6) | **Interactive** — local CLI on operator's Windows machine | Full repo access. Writes code, spawns sub-agents, runs tests, verifies builds, critiques own work. Main session is persistent memory across the build. Reads `CLAUDE.md` for governance and context. | Each spawned sub-agent starts with clean context. Context is lost between interactive sessions. Without structured prompts, will default to single-agent mode. |
| **IMPLEMENTER** | Claude Code (Opus 4.6) | **Automated** — GitHub Actions via `anthropics/claude-code-action@v1` | Triggered by GitHub events (issues, PRs, pushes). Reads `CLAUDE.md` for persistent context and governance. Can read/write files, create commits, open PRs, comment on issues. | Each run is a fresh session. Cannot retain state between runs except via repo files. Subject to GitHub Actions usage limits. |
| **OPERATOR PROXY / PROMPT ENGINEER** | OpenAI Codex | **Offline** — used directly by operator outside the automated loop | Full repo access. Reads `AGENTS.md` for its role firmware and OIB templates. Reads plan, current state, and Claude's output. Builds structured prompts for Claude. Answers Claude's escalated questions. Helps operator make architectural decisions. | Not in the automated loop. Cannot trigger or be triggered by GitHub Actions. Operator must manually relay prompts between Codex and Claude. |
| **OPERATOR** | Human (Scott) | Direct | Sets vision, approves phase transitions, answers business/product questions. Final authority per Prompt Doctrine. Uses Codex as a proxy to construct prompts and navigate technical decisions. | Does not make technical decisions alone. Reviews PRs and phase gates. Relays structured prompts from Codex to Claude. |

### Decision routing rules

| Decision type | Who handles it |
|---------------|---------------|
| Implementation detail (how to write a function, fix a type error, structure a test) | Claude Code — no escalation |
| Architectural decision (schema design, contract choice, module boundary) | Claude Code escalates to operator. Operator consults Codex. Codex advises and builds the response prompt. |
| Business/product decision (which platforms, what the SMS says, priorities) | Operator directly (may consult Codex for framing) |
| Disagreement between plan and reality (something in the plan doesn't work as written) | Claude Code flags to operator via GitHub Issue with options. Operator asks Codex to evaluate options and build a response prompt. |
| "What should I prompt Claude to do next?" | Operator asks Codex. Codex reads current state + plan, builds structured OIB prompt. Operator pastes it to Claude. |

---

## 3. Communication Protocol

### Overview
Communication happens through GitHub Issues and `CLAUDE.md`. GitHub Issues serve as the task queue, discussion forum, and decision log. `CLAUDE.md` provides persistent context that every Claude Code session (interactive or automated) reads automatically.

### GitHub Issues as task queue

Each architectural decision, implementation task, or phase transition is a GitHub Issue. Labels drive the state machine:

| Label | Meaning |
|-------|---------|
| `phase:1` through `phase:6` | Which build phase this belongs to |
| `type:architecture` | Architectural decision needed |
| `type:implementation` | Implementation task |
| `type:phase-gate` | Phase transition approval request |
| `type:bug` | Bug or regression |
| `needs-review` | Awaiting operator review |
| `ready-to-implement` | Approved, ready for Claude to pick up |
| `blocked` | Blocked on external input or dependency |
| `completed` | Done |

### Issue lifecycle
1. Claude Code (interactive or automated) creates an Issue with appropriate labels
2. For architectural decisions: Claude documents the question, options, and recommendation in the Issue body
3. Operator reviews and approves (or redirects) via Issue comment
4. Claude Code picks up approved Issues (manually in interactive mode, or via GitHub Actions trigger on label change)
5. Implementation results are documented in Issue comments
6. Issue is closed and labeled `completed` when done

### CLAUDE.md — firmware for Claude (Opus)

**Target: under 100 lines.** Research shows Claude's compliance with CLAUDE.md degrades as the file grows. Keep it lean — use `@imports` for detailed content.

```
CLAUDE.md (repo root) — KEEP UNDER 100 LINES

  ## Project State (updated frequently)
  - Project identity and purpose (2-3 lines)
  - Current build phase and status (1 line)
  - Key decisions made this phase (bulleted, append-only)
  - File map with heat indicators: HOT (active this phase) / WARM / COLD
  - Links to reference docs

  ## Governance (updated rarely)
  - **YOU MUST** escalate architectural decisions to operator
  - **YOU MUST** use /spawn-agent when spawning sub-agents
  - **IMPORTANT:** Use /clear between major tasks
  - Authority boundaries (2-3 lines max)
  - Stop conditions (1-2 lines)

  ## Detailed References (loaded on demand, not inline)
  - @docs/FINAL_BUILD_PLAN.md for phase details
  - @docs/AGENTIC_SYSTEM_DESIGN.md for system design
```

Read automatically by:
- Claude Code CLI (interactive sessions)
- `anthropics/claude-code-action@v1` (automated GitHub Actions runs)

`CLAUDE.md` is Claude's operating manual. It must be concise — every line competes for Claude's attention.

### CLAUDE.md compliance strategy

**Problem:** Community research confirms Claude "picks and chooses" which CLAUDE.md rules to follow, especially mid-conversation. A Hacker News user reported compliance is "somewhat reliable at the beginning and end of the conversation, but likely to ignore during the middle." Reddit users describe it as "more guidelines than actual rules."

**Mitigations (from cross-check research, Feb 2026):**

1. **Keep CLAUDE.md under 100 lines.** The more content that isn't universally applicable, the more likely Claude ignores instructions. Use `@path/to/file.md` imports for detailed sections.
2. **Use emphasis markers for critical rules.** `**YOU MUST**`, `**IMPORTANT:**`, `**STOP**` get higher attention weight than plain text.
3. **Use `/clear` between major tasks.** Resets context attention so CLAUDE.md rules get re-read with full weight.
4. **Move the sub-agent prompt template to `.claude/commands/spawn-agent.md`.** This uses Claude Code's progressive-disclosure Skills system — the template loads on-demand when Claude needs it, instead of sitting in CLAUDE.md competing for attention with governance rules.
5. **Use subdirectory CLAUDE.md files** for phase-specific instructions. Claude loads both root and subdirectory files when working in that directory.
6. **Canary test:** Periodically include a trivial instruction (e.g., "end status reports with '-- WorkShot'") to verify Claude is still attending to CLAUDE.md. If it stops, the file needs trimming.
7. **Feedback loop:** After task completion, verify deliverables against the original OIB prompt in a fresh context. Don't trust mid-session self-verification alone.

### AGENTS.md — firmware for Codex
```
AGENTS.md (repo root)
  - Codex's role definition (operator proxy, prompt engineer, architectural advisor)
  - OIB structured prompt template (the format Codex uses to build prompts for Claude)
  - Decision routing rules (what Codex decides vs. what it escalates to operator)
  - How to read current project state from CLAUDE.md and repo files
  - How to interpret Claude's escalation requests
  - Sub-agent prompt template (for when OIB prompts should instruct Claude to spawn teammates)
  - Standing instructions for each phase of the build plan
```

Read by Codex at the start of every session. `AGENTS.md` is Codex's operating manual — it tells Codex how to construct prompts, what format to use, and how to translate operator intent into structured instructions that Claude will follow.

**Why two files:** Each agent has its own firmware. `CLAUDE.md` governs Claude's behavior. `AGENTS.md` governs Codex's behavior. Neither agent needs to read the other's firmware — they communicate through the structured prompts that Codex builds and the operator relays.

This split is inspired by Sigma's `CLAUDE.md` + `AGENTS.md` pattern, adapted for WorkShot's architecture where Codex operates outside the automated loop.

### v1 protocol (historical)
The original file-based task queue (`docs/.tasks/QUEUE.md`, `DECISIONS.md`, `PROTOCOL.md`) was designed and tested during the v1 architecture with Codex. TASK-000 confirmed that Codex cannot self-trigger — which led to the v2 redesign using GitHub Actions. These files remain in the repo as historical artifacts.

---

## 4. Trigger Mechanism

### How it works
GitHub Actions provides event-driven automation. When specific events occur in the repository, workflows trigger `anthropics/claude-code-action@v1`, which spawns a fresh Claude Code session with full repo access.

### Key capability: `claude-code-action@v1`
- Automatically reads `CLAUDE.md` from repo root on every run (persistent context)
- Can read Issue bodies and comment threads (full context of the task)
- Can write comments on Issues and PRs
- Can create commits and push to branches
- Can open Pull Requests
- Runs as a GitHub App with configurable permissions

### Known gotchas (from cross-check research)
- **Permission issues in headless mode:** `auto_approve: true` may not work reliably for file writes. Configure `allowed_tools` explicitly in the workflow YAML.
- **Default 10-turn limit:** Must set `--max-turns` in `claude_args` explicitly — even small PRs can hit the default limit.
- **No network access controls:** Claude Code Action has no restrictions on network access. For production, consider runtime security monitoring (e.g., Harden-Runner).
- **Workflow YAML must grant permissions:** Explicitly set `pull-requests: write` and `contents: write` in the workflow permissions block.
- **Cost:** ~$0.24+ per run depending on task complexity. Set workflow-level timeouts and use GitHub concurrency controls to limit parallel runs.

### Recommended MCP servers
MCP (Model Context Protocol) servers give Claude richer tool access. These are directly relevant to WorkShot's image processing pipeline:

| MCP Server | Package | Capability |
|------------|---------|------------|
| `sharp-mcp` | `npx -y sharp-mcp` | Image session management, get dimensions, pick colors, extract regions, remove backgrounds |
| `mcp-image-optimizer` | `npx -y mcp-image-optimizer` | Resize, rotate, crop, format conversion (JPEG/PNG/WebP/AVIF), smart crop, watermarks, placeholders |
| `agent-task-queue` | Block's MCP server | Prevents concurrent build thrashing when multiple agents run on the same machine |

Install with: `claude mcp add <name> -- npx -y <package>`

### Trigger events

| Event | Use case | Example workflow |
|-------|----------|-----------------|
| `issues.opened` | New task created — Claude triages and begins work | Auto-label, create implementation branch |
| `issues.labeled` | State transition — e.g., `ready-to-implement` applied | Pick up approved task, begin implementation |
| `push` to `main` | Code merged — run validation, update `CLAUDE.md` status | Post-merge checks, phase gate verification |
| `pull_request.opened` | PR created — Claude reviews | Automated code review |
| `issue_comment.created` | Operator responds to a question | Claude reads response and continues |

### Example workflow (simplified)
```yaml
name: claude-implement
on:
  issues:
    types: [labeled]

jobs:
  implement:
    if: github.event.label.name == 'ready-to-implement'
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Read the issue and implement the requested change.
            Follow the plan in docs/FINAL_BUILD_PLAN.md.
            Create a PR with your changes.
```

### v1 trigger mechanism (historical)
The original design required manual operator nudges between Codex and Claude Code sessions. TASK-000 in `docs/.tasks/QUEUE.md` confirmed that neither agent can self-trigger or poll. This was the primary motivation for adopting GitHub Actions in v2.

---

## 5. Implementation Agent Model

### Two execution modes

#### Interactive mode (local CLI)
The operator runs Claude Code directly on their Windows machine. This is the primary mode for hands-on build work.

- **Persistent context:** The main CLI session retains memory across the full conversation
- **Sub-agents:** Claude Code spawns sub-agents via the Task tool for parallelizable work. Each sub-agent starts with a clean context — the main session must provide full context in each agent prompt.
- **Best for:** Phase implementation, debugging, exploratory work, design decisions

#### Automated mode (GitHub Actions)
`anthropics/claude-code-action@v1` runs Claude Code in response to GitHub events. Each run is a fresh session.

- **Persistent context:** `CLAUDE.md` is read automatically at the start of every run
- **Best for:** Issue triage, automated reviews, post-merge checks, picking up approved tasks
- **Limitation:** Cannot retain state between runs except via `CLAUDE.md` and repo files

### Per-phase workflow (interactive mode)
1. Main session reads current repo state (git status, key files)
2. Main session reads `CLAUDE.md` for current phase context and prior decisions
3. Main session spawns IMPLEMENTER sub-agent with:
   - Phase scope from `docs/FINAL_BUILD_PLAN.md`
   - Current state summary
   - Relevant prior decisions
   - Specific exit conditions to verify
4. Sub-agent executes the work and reports back
5. Main session verifies exit conditions
6. Main session reports to operator: what changed, what passed, what needs approval
7. Main session updates `CLAUDE.md` with phase completion status
8. Operator approves next phase

### Per-task workflow (automated mode)
1. GitHub event triggers Action (e.g., Issue labeled `ready-to-implement`)
2. `claude-code-action@v1` spawns fresh Claude Code session
3. Session reads `CLAUDE.md` + Issue body + comment thread
4. Session implements the task, commits to a branch, opens PR
5. Operator reviews PR

### When to spawn sub-agents vs. do directly
- **Spawn a sub-agent:** Multi-step implementation work, test writing, code generation
- **Do directly:** File reads, git operations, verification checks, `CLAUDE.md` updates

### Structured prompt templates

There are two structured prompt formats in the system — one for each handoff point:

1. **Codex-to-Claude (OIB)** — lives in `AGENTS.md`. Codex uses this to build prompts that the operator pastes to Claude.
2. **Claude-to-sub-agent** — lives in `.claude/commands/spawn-agent.md`. Claude invokes this via `/spawn-agent` when spawning teammates. Uses Claude Code's progressive-disclosure system: the template loads on-demand instead of sitting in CLAUDE.md competing for attention.

Both formats serve the same purpose: prevent the receiving agent from defaulting to unstructured execution.

#### Operator-to-Claude prompt (built by Codex)
```
ROLE: IMPLEMENTER
MODE: IMPLEMENTATION_TASK | REVIEW | EXPLORATION
AUTHORITY: <what Claude can decide without asking>
GOAL: <single sentence — what this task accomplishes>

PLAN REFERENCE: docs/FINAL_BUILD_PLAN.md, Phase <N>, Step <N>
CURRENT STATE: <brief summary of repo state, last completed step>

CONSTRAINTS:
- <boundary 1>
- <boundary 2>

INPUTS:
- <file or context Claude needs to read>

DELIVERABLES:
- <concrete output 1>
- <concrete output 2>

EXIT CONDITIONS:
- <how to verify success>

STOP AFTER DELIVERABLES.
For non-trivial tasks, spawn sub-agents via the Task tool.
```

#### Lead-to-sub-agent prompt (spawned via Task tool)
```
ROLE: <specific role — e.g., "test writer", "module implementer">
GOAL: <single sentence>
SCOPE: <specific files/modules this agent touches>

CURRENT STATE:
- <repo state relevant to this subtask>
- <decisions already made>

CONSTRAINTS:
- <boundary 1>

DELIVERABLES:
- <what to return to the lead>

EXIT CONDITIONS:
- <how to verify success>

STOP AFTER DELIVERABLES.
```

#### Why this matters
Without structured prompts at both handoff points:
- **Without OIB (Codex->Claude):** Claude receives vague instructions, makes assumptions about scope, skips sub-agents, and works past the intended stop point
- **Without sub-agent template (Claude->teammates):** Sub-agents start with no context, make incorrect assumptions, and produce work that doesn't fit the lead's plan

The structured formats are the **enforcement mechanism** at each layer:
- `AGENTS.md` contains the OIB template so Codex always builds prompts the same way
- `.claude/commands/spawn-agent.md` contains the sub-agent template so Claude always spawns teammates the same way (loaded on-demand via `/spawn-agent`, keeping CLAUDE.md lean)
- `CLAUDE.md` contains the directive `**YOU MUST** use /spawn-agent when spawning sub-agents` — the minimum enforcement needed in the main file
- The operator never needs to understand either template — Codex handles the Codex->Claude handoff, and Claude handles the Claude->sub-agent handoff automatically

### Context routing discipline
Since sub-agents (and automated sessions) start with clean context, the main session / `CLAUDE.md` must be a good router:
- Always include current repo state in sub-agent prompts
- Always include relevant architectural decisions
- Always include the specific exit conditions to verify
- If context is missing, the sub-agent will make incorrect assumptions

---

## 6. Git Workflow

### Branch strategy
- **Pre-Phase 1:** Rename `master` to `main` (reconcile the current branch split)
- **Phases 1-3:** Direct commits to `main`. One developer, no CI yet. PRs add ceremony with no safety value.
- **Phases 4-6:** Feature branches (`feat/<topic>`, `fix/<topic>`, `chore/<topic>`) with PR into `main`. CI must pass before merge.
- **Phase 6 exit:** Tag `v1.0.0` on contract freeze.

### Commit conventions
Conventional commits throughout all phases:
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance, dependency updates
- `docs:` — documentation only
- `test:` — test additions or changes

### Commit granularity
One commit per implementation order step (24 steps in the plan). Each step is a single logical unit. Clean `git log` history enables easy bisect if something breaks.

---

## 7. Review Loop (Architect/Critic Cycle)

### Standard flow (v2)
```
1. ARCHITECT (Claude)   -> Produce plan or brief
2. CRITIC (Claude)      -> Self-review for blockers (PASS / BLOCK)
3. REVISE (Claude)      -> Fix blockers if any, return to step 2
4. IMPLEMENT (Claude)   -> Execute approved plan, then STOP
5. OPERATOR             -> Approve phase transition
```

In v2, Claude handles both ARCHITECT and CRITIC roles within the same session or across sessions. The operator remains the approval gate for phase transitions and business decisions.

### How it worked for R1 planning (historical — v1 with Codex)
1. Codex produced `docs/ARCHITECTURE_RECON_REPORT.md` (recon) and `docs/CODEX_BUILD_PLAN.md` (initial plan)
2. Claude Opus produced `docs/OPUS_CRITIQUE.md` — issued BLOCK with 6 findings and 5 plan deltas
3. Operator added critical context (full system vision: WhatsApp -> SMS -> social publishing)
4. Claude Opus wrote updated Codex prompt incorporating critique findings + system vision
5. Codex produced `docs/FINAL_BUILD_PLAN.md` (synthesized plan resolving all findings)
6. Claude Opus reviewed final plan — issued **PASS**

This cycle validated the multi-agent review model. The v2 architecture internalizes the same discipline within Claude sessions.

### Expected review frequency during implementation
- **Per-phase:** Claude Code verifies exit conditions after each phase, reports to operator
- **Architectural questions:** Claude decides directly, documents rationale. Escalates to operator if business implications.
- **Business questions:** Routed to operator via GitHub Issue
- **Full critique pass:** Only if a phase produces unexpected results or the plan needs revision

---

## 8. Operator's Minimal Responsibilities

The v2.1 system keeps operator involvement focused on direction-setting, with Codex handling the technical translation.

| Action | Frequency | Effort |
|--------|-----------|--------|
| Ask Codex "what should I prompt Claude to do next?" | At each phase step or when stuck | ~1 minute (Codex builds the prompt) |
| Paste Codex's structured prompt to Claude | After each Codex interaction | Seconds (copy-paste) |
| Approve phase transition | Once per phase (6 total for R1) | 1-2 minutes review |
| Review PRs | As Claude opens them | Varies |
| Answer business/product questions | As they arise | Varies |
| Relay Claude's escalations to Codex | When Claude flags a decision it can't make | ~1 minute |

The operator does NOT need to:
- Write prompts from scratch (Codex builds them)
- Make technical decisions alone (Codex advises)
- Understand implementation details
- Write code or review diffs (unless they want to)

**The key workflow:** Operator asks Codex -> Codex reads repo state + plan -> Codex builds structured prompt -> Operator pastes to Claude -> Claude executes -> Claude reports back -> repeat.

---

## 9. Known Limitations

1. **CLAUDE.md compliance degrades mid-conversation.** Community research confirms Claude "picks and chooses" which CLAUDE.md rules to follow, especially in the middle of long sessions. Mitigations: keep under 100 lines, use emphasis markers, use `/clear` between tasks, use canary tests. See "CLAUDE.md compliance strategy" section above.

2. **Session context isolation.** Each GitHub Actions run and each sub-agent starts with a clean context. `CLAUDE.md` mitigates this by providing persistent project context, but it cannot capture everything from a long interactive session. Critical decisions must be written to `CLAUDE.md` or repo files to persist.

3. **CLAUDE.md is manually maintained.** There is no automatic mechanism to update `CLAUDE.md` when decisions are made. The operator or Claude Code (in interactive mode) must explicitly update it. If forgotten, automated sessions will lack context.

4. **claude-code-action headless issues.** Permission approval for file writes may fail silently. Default 10-turn limit truncates work. No network access controls. See "Known gotchas" in Trigger Mechanism section.

5. **GitHub Actions usage limits.** GitHub Actions has per-repo and per-org usage limits. Heavy automated workflows (especially on push events) could exhaust free-tier minutes. Cost must be monitored (~$0.24+ per run).

6. **Codex is offline.** Codex provides architectural guidance and builds prompts, but it's not in the automated loop. The operator must manually relay between Codex and Claude. This is intentional (keeps the automated system simple) but means Codex can't react in real-time to Claude's work. Agent Teams (see Future Improvements) may eventually replace this relay for within-session coordination.

7. **Platform dependency.** The automated mode depends on GitHub (Issues, Actions, PRs). If the repo moves off GitHub, the trigger mechanism must be redesigned.

---

## 10. Future Improvements to Explore

### Near-term (R1 or early R2)

1. **Adopt Agent Teams for sub-agent coordination.** Anthropic shipped Agent Teams with Opus 4.6 (Feb 2026). Key capabilities over our current Task tool pattern: peer-to-peer teammate communication, shared task list with auto-claim, delegate mode (lead coordinates without implementing), and plan approval (lead reviews before teammate implements). **Trade-off:** ~7x token cost increase. **Adopt when:** a single task requires 3+ parallel sub-agents that need to coordinate with each other. Anthropic used 16 agents with this feature to build an entire C compiler.

2. **Automated CLAUDE.md updates.** A post-merge GitHub Action could automatically update `CLAUDE.md` with phase completion status, recent decisions, and file map changes. This would reduce the manual maintenance burden (limitation #3).

3. **Install sharp MCP servers.** `sharp-mcp` and `mcp-image-optimizer` are directly relevant to WorkShot's image processing pipeline. Install during Phase 1 so Claude can inspect image dimensions, colors, and regions natively. See Trigger Mechanism section for details.

### Medium-term (R2+)

4. **Bring Codex into the automated loop.** If the manual relay between Codex and Claude (limitation #6) becomes too slow, Codex can be added to GitHub Actions via `openai/codex-action`. This would let Codex automatically review PRs or respond to architectural escalations without operator relay.

5. **Git worktrees for parallel agent isolation.** Multiple Claude Code Action runs could operate on separate git worktrees to avoid conflicts when working on different Issues simultaneously. Plan agent assignments around file boundaries, not feature boundaries. Identify hot files and protect them from concurrent agent access.

6. **Linear for task management.** If GitHub Issues hits scaling limits (no native queue semantics, no atomic state transitions, no retry logic), Linear's MCP integration supports AI-native task management where agents can create/update issues programmatically.

### Long-term

7. **Orchestration frameworks.** Claude-Flow, CrewAI, AutoGen, LangGraph, or MetaGPT could replace the GitHub Actions + Issues coordination if the project grows beyond what label-driven automation supports. Claude-Flow is the most interesting — it deploys 60+ specialized agents with anti-drift controls and consensus algorithms. Most frameworks are better suited for greenfield orchestration than code-on-repo workflows.

8. **File tiering optimization.** The cross-check research found a team achieved 94.5% token reduction by labeling files as HOT/WARM/COLD and feeding only relevant files to context. The CLAUDE.md file map already includes heat indicators per phase — this could be automated with a script that analyzes git diff to determine which files are active.

---

## 11. Reference Documents

### Active documents
| Document | Role |
|----------|------|
| `CLAUDE.md` | Firmware for Claude — project state, governance, behavioral rules. Under 100 lines. (to be created) |
| `AGENTS.md` | Firmware for Codex — OIB templates, role definition, prompt construction rules (to be created) |
| `.claude/commands/spawn-agent.md` | Sub-agent prompt template — invoked by Claude via `/spawn-agent` (to be created) |
| `docs/FINAL_BUILD_PLAN.md` | Canonical R1 execution plan (PASS verdict) |
| `docs/AGENTIC_SYSTEM_DESIGN.md` | This document — agentic system design (v2.2) |
| `docs/BUILD_PLAN.md` | Master roadmap R1-R4 |
| `docs/WORKSHOT_PROMPT_DOCTRINE.md` | Operator workflow rules and role definitions |

### Historical / reference documents
| Document | Role |
|----------|------|
| `docs/ARCHITECTURE_RECON_REPORT.md` | Repository reconnaissance (Codex, v1 planning) |
| `docs/CODEX_BUILD_PLAN.md` | Original Codex build plan (superseded by FINAL) |
| `docs/OPUS_CRITIQUE.md` | Opus critical review of original plan |
| `PHASE_R0_REPO_HARDENING_PLAN.md` | Governance contract |
| `REPO_CONFIGURATION_PLAN.md` | Draft repo structure (superseded — future-only) |

### v1 artifacts (historical)
| Document | Role |
|----------|------|
| `docs/.tasks/PROTOCOL.md` | v1 file-based task queue protocol specification |
| `docs/.tasks/QUEUE.md` | v1 task queue (contains TASK-000 connectivity test) |
| `docs/.tasks/DECISIONS.md` | v1 architect decision log (contains TASK-000 response) |
