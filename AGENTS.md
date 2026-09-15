# Agent instructions — GymOS

This repository uses a shared AI workflow hub. **Do not invent parallel project
rules here.**

## Before any work

1. Read [`ai-workflow/PROJECT.md`](ai-workflow/PROJECT.md)
2. Read [`ai-workflow/WORKFLOW.md`](ai-workflow/WORKFLOW.md)
3. Read the **active** task under [`ai-workflow/tasks/`](ai-workflow/tasks/)
   (create from [`ai-workflow/TASK_TEMPLATE.md`](ai-workflow/TASK_TEMPLATE.md) if none)

## Rules

- Follow the lifecycle, ownership, handoff, scope-control and validation rules in WORKFLOW.md.
- Truth order: code/config → `.env.example` / package scripts → `ai-workflow/DECISIONS.md` → `design/` + `product/` → strategy teardown.
- The eight invariants are in [`CLAUDE.md`](CLAUDE.md) — they apply to every agent, not just Claude Code.
- Do not silently expand scope. MVP scope is frozen: [`product/scope-freeze.md`](product/scope-freeze.md).
- Mark unknowns as VERIFY.
- Use **pnpm** (`pnpm --filter`), never `npm --filter`. Never run an app without turbo.

Hub index: [`ai-workflow/README.md`](ai-workflow/README.md).
