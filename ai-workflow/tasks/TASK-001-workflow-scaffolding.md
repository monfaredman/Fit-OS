# TASK-001 — AI workflow scaffolding

| Field | Value |
|-------|-------|
| **Task ID** | TASK-001 |
| **Title** | AI workflow scaffolding |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Adopt the Trend `ai-workflow/` convention so every coding agent shares one lifecycle, one task ledger and one source-of-truth order.

## Acceptance criteria

- [x] `ai-workflow/{README,PROJECT,WORKFLOW,TASK_TEMPLATE,DECISIONS}.md` exist
- [x] Thin adapters `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` point at the hub
- [x] The eight invariants are stated once, in `CLAUDE.md`
- [x] Task ledger seeded with TASK-002…010

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`ai/dev-workflow.md`](../../ai/dev-workflow.md)

## Out of scope

No code. No `.cursor`/`.junie`/`.amazonq` adapters until those tools are actually used.

## Implementation plan

1. Hub files, GymOS-specific PROJECT.md
2. Adapters
3. Seed DECISIONS with D-001…D-006
4. Create TASK-002…010 as `planned`

## Files changed

| Path | Change |
|------|--------|
| `ai-workflow/` | README, PROJECT, WORKFLOW, TASK_TEMPLATE, DECISIONS + 10 task files |
| `CLAUDE.md` | Adapter + the eight invariants (loaded every session) |
| `AGENTS.md`, `GEMINI.md` | Thin adapters pointing at the hub |

## Commands and tests executed

```bash
# docs only — no build surface
```

## Decisions and assumptions

- Invariants live in `CLAUDE.md` rather than PROJECT.md: Claude Code auto-loads it, so it is the one file guaranteed to be in context.
- No `.cursor` / `.junie` / `.amazonq` adapters until those tools are actually used.

## Unresolved issues

- None.

## Review findings

- …

## Handoff notes

- **From → To:** planner → implementer (TASK-002)
- **Done:** hub, adapters, task ledger 001–010
- **Next:** TASK-002 monorepo foundation
- **Risks:** none

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
