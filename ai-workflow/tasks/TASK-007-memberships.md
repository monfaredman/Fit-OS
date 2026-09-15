# TASK-007 — Plans & memberships

| Field | Value |
|-------|-------|
| **Task ID** | TASK-007 |
| **Title** | Plans & memberships |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

Sell, freeze and renew memberships, including the session-count model that dominates Iranian gyms.

## Acceptance criteria

- [ ] `GET /v1/plans`; `POST /v1/memberships`
- [ ] Plan kinds: `duration` · `session_count` · `hybrid` · `open`
- [ ] `POST /v1/memberships/:id/freeze` and `/unfreeze` — freeze extends `endsAt` by credited days
- [ ] `POST /v1/memberships/:id/renew`
- [ ] Selling posts a balanced `membership_sale` ledger transaction with the discount on its own account
- [ ] Expiry arithmetic uses `@gymos/core` `addDays` — 31-day month boundaries covered by tests
- [ ] `jalaliYm` denormalised on write

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/domain-model.md`](../../design/domain-model.md) §3

## Out of scope

Booking, classes, waitlists. Trainer commission settlement (V1).

## Implementation plan

1. `memberships.module/controller/service`
2. `membership-rules.ts` pure module: expiry, freeze credit, session consumption
3. Ledger posting through `@gymos/core` builders
4. Recompute `access_snapshot` on every write

## Files changed

| Path | Change |
|------|--------|
| | |

## Commands and tests executed

```bash
```

## Decisions and assumptions

- …

## Unresolved issues

- …

## Review findings

- …

## Handoff notes

- **From → To:**
- **Done:**
- **Next:**
- **Risks:**

## Definition-of-done checklist

- [ ] Acceptance criteria met
- [ ] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [ ] Files changed listed
- [ ] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [ ] Handoff notes updated
