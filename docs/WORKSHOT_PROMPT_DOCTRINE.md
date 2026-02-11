# WorkShot Prompt Doctrine

## Philosophy

- Prompts are executable contracts, not casual requests
- Critique happens before implementation, every time
- The human operator is final authority — always

## Roles

| Role | Purpose |
|------|---------|
| **ARCHITECT** | Designs the approach. Produces plans, briefs, specifications. Does not write code. |
| **CRITIC** | Attacks the plan. Finds blockers, gaps, ambiguities. Returns PASS or BLOCK. |
| **IMPLEMENTER** | Executes approved work. Follows the brief exactly. Does not expand scope. |

## Standard Execution Loop

```
1. ARCHITECT  →  Produce plan or brief
2. CRITIC     →  Review for blockers (PASS / BLOCK)
3. REVISE     →  Fix blockers if any, return to step 2
4. IMPLEMENT  →  Execute approved plan, then STOP
```

Never skip step 2.

## Self-Gating Prompt Template

Use this two-phase structure for any non-trivial work:

```
ROLE: [ARCHITECT | CRITIC | IMPLEMENTER]
MODE: [PLAN | CRITIQUE | EXECUTE]
SCOPE: [specific boundary]

--- PHASE 1: CRITIQUE ---
Before any implementation:
- List blockers (fatal flaws that prevent success)
- List weaknesses (problems that don't block but should be noted)
- Return: PASS or BLOCK

If BLOCK: Stop. Do not proceed to Phase 2.

--- PHASE 2: IMPLEMENTATION ---
Only if Phase 1 returned PASS:
- Execute the scoped work
- Report what was done
- Then STOP
```

## Operator Rules

- Never skip critique phase
- Never expand scope mid-execution
- Human approval required before implementation begins
- Implementation halts immediately on BLOCK
- One role per prompt — do not mix ARCHITECT and IMPLEMENTER
- When done, STOP — do not suggest next steps unless asked

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Casual prompts without role/scope | Invites scope creep and guessing |
| Mixing roles in one prompt | Confuses authority and skips critique |
| Silent scope expansion | Violates operator trust |
| Implementing without critique | Ships broken or insecure work |
| Continuing after BLOCK | Ignores the gate |

## Final Rule

**If the prompt is unclear, stop — do not guess.**
