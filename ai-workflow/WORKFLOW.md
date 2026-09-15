# Multi-agent workflow — GymOS

Shared lifecycle and collaboration rules for every tool. Project facts live in
[PROJECT.md](PROJECT.md); do not fork them here.

## Required reading before work

1. [PROJECT.md](PROJECT.md)
2. This file ([WORKFLOW.md](WORKFLOW.md))
3. The **active** task file under [tasks/](tasks/)

If no active task exists for the requested work, create one from
[TASK_TEMPLATE.md](TASK_TEMPLATE.md) with status `proposed` before implementing.

## Task lifecycle

```text
proposed → planned → in-progress → review → blocked | done
```

| Status | Meaning |
|--------|---------|
| `proposed` | Goal sketched; not yet planned |
| `planned` | Acceptance criteria + plan agreed; no claim of implementation complete |
| `in-progress` | An owner is actively changing code or docs |
| `review` | Implementation claimed ready; awaiting review |
| `blocked` | Waiting on decision, access, or external fix — note why |
| `done` | Acceptance criteria met and relevant validation passed |

## Roles

Any tool may play any role. Declare role in the task handoff.

| Role | Allowed | Forbidden |
|------|---------|-----------|
| **Planner** | Clarify goal, AC, plan, risks; set status `planned` | Mark implementation complete or `done` |
| **Implementer** | Edit code/docs within scope; record files + commands; move to `review` | Silent scope expansion; overwrite unfinished work |
| **Reviewer** | Check correctness, scope, tests, doc conflicts, unsupported assumptions | Rewrite large areas without handoff |

## Ownership and handoff

1. When beginning work, set **status** and **current agent / owner** on the task.
2. Before editing, inspect git/working-tree changes and the task's **Files changed**
   section. **Do not overwrite another agent's unfinished work.**
3. Before another agent continues, leave a concise **Handoff notes** entry.
4. Only one active implementer at a time unless the task splits ownership by path.

## Scope control

- Do not silently expand task scope.
- Out-of-scope discoveries → **Unresolved issues**, or open a new task.
- New architectural assumptions → [DECISIONS.md](DECISIONS.md).
- The MVP scope is frozen: [`product/scope-freeze.md`](../product/scope-freeze.md).
  A feature not on that list does not get built because it seemed easy.

## The invariants

Eight rules in [`../CLAUDE.md`](../CLAUDE.md) are not style preferences — four of
them (ledger, money, Jalali, tenancy) are unrecoverable if violated silently.
Any task touching them must add or extend a test. A reviewer who sees a ledger
change with no test sends it back.

## Review checklist

1. Correctness against acceptance criteria
2. Scope adherence
3. Tests and commands recorded and sensible
4. Conflicts with code, `.env.example`, DECISIONS, or the design pack
5. Unsupported assumptions (invented APIs, ports, status)
6. **Invariant tests present** where column-2 surfaces were touched

## Safety

- No secrets in logs, commits, or task files.
- Prefer fixtures over live external calls in CI.
- Do not invent project facts; mark unknowns **VERIFY**.

## Definition of done (task-level)

- [ ] Acceptance criteria checked off
- [ ] Relevant lint / typecheck / test / build executed and recorded
- [ ] Files changed listed
- [ ] Decisions/assumptions recorded (DECISIONS.md updated if needed)
- [ ] Review completed (or explicitly waived for docs-only tasks, with justification)
- [ ] Handoff notes left if another agent may continue
