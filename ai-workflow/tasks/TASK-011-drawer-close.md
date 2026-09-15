# TASK-011 — Cash drawer close and variance

| Field | Value |
|-------|-------|
| **Task ID** | TASK-011 |
| **Title** | Cash drawer close and variance |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Close the cash-skimming path that the capability matrix alone does not.
Receptionists cannot write off arrears, but the simplest attack needs no
write-off: take the cash, never record the payment, let the member show as in
arrears and be chased. A per-shift variance is what closes it.

Pulled forward ahead of TASK-010 because it protects a real gym's money.

## Acceptance criteria

- [x] `GET /v1/drawer/current` — expected cash **derived from the ledger**
- [x] `POST /v1/drawer/close` — staff supply only what they counted
- [x] `GET /v1/drawer/history` — gated on `drawer.variance.all`
- [x] Variance graded balanced / minor / significant against a tolerance
- [x] Both directions reported — a surplus is as much a signal as a shortfall
- [x] Persian message in Toman, framed as reconciliation not accusation
- [x] `drawer_close` is append-only, RLS-scoped
- [x] Post-close reset resets cleanly (was a seed bug — see Decisions)

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/permissions.md`](../../design/permissions.md) §2

## Files changed

| Path | Change |
|------|--------|
| `packages/db/drizzle/0003_drawer_close.sql` | table, RLS, append-only trigger |
| `packages/db/src/schema.ts` | `drawerClose` |
| `apps/api/src/money/drawer.ts` | pure variance + Persian summary |
| `apps/api/src/money/drawer.test.ts` | 10 tests |
| `apps/api/src/money/money.service.ts` | `drawerCurrent`, `drawerClose`, `drawerHistory` |
| `apps/api/src/money/money.controller.ts` | three endpoints |
| `packages/contracts/src/dto.ts` | `drawerCloseBodySchema` |

## Commands and tests executed

```bash
pnpm db:migrate                 # 0003 applied
REQUIRE_DB=1 pnpm test          # 198 tests, 9 tasks
pnpm typecheck && pnpm build    # clean

# live
GET  /v1/drawer/current  → expected 172,250,000 T, derived
POST /v1/drawer/close    → counted short 200,000 T
                           variance -200,000 T, severity significant,
                           «کسری صندوق: 200,000 تومان»
GET  /v1/drawer/history  → receptionist 403, owner sees staff + variance + note
UPDATE drawer_close      → rejected, append-only
```

## Decisions and assumptions

- **Expected is always derived from the ledger**, never stored and never entered
  by the person being measured. That is the entire control; a stored expected
  figure could be edited by whoever is short.
- A close is **evidence**, so `drawer_close` is append-only like the ledger. A
  correction is a new close, not an edit.
- **Both directions are reported.** A consistent surplus usually means payments
  are being recorded at the wrong amount — as much a signal as a shortfall.
- Default tolerance 10,000 Rial (1,000 Toman): miscounted change, not theft.
  Per-org configurable.
- The Persian copy says «صندوق تراز است» / «کسری صندوق», never an accusation.
  `design/permissions.md` §2 is explicit that this is sold as "the drawer closes
  correctly every night" — Iranian gym owners often employ family.

### The post-close reset bug — resolved, and it was not the drawer

`drawer/current` reported a non-zero figure after a close. The drawer query was
correct all along: the **seed** was dating payments in the future.
`paidAt = startsAt + 0..3 days`, and when `startsAt` landed on today that put the
payment up to three days ahead. Twenty such transactions sat permanently after
any close boundary. `occurred_at` was 2026-09-16 while `created_at` was
2026-09-15 — that one-line comparison is what gave it away.

Two fixes, because either alone would leave a hole:
- the seed clamps `paidAt` to `now()`; real gyms do not take tomorrow's cash
- `expectedCash` adds `AND lt.occurred_at <= now()` — cash that has not arrived
  cannot have been counted, whatever an import or a wrong device clock says

### A new append-only table has to be registered in two places

Adding `drawer_close` with an immutability trigger broke `pnpm db:seed`: the org
wipe's cascade hit a trigger the wipe list did not know about. Same class as
D-009. Rather than just add the entry, `seed.ts` now runs
`assertWipeListComplete()`, which reads the `%_immutable` triggers out of
`pg_trigger` and fails with a named list if `APPEND_ONLY_TABLES` is missing any.
The next person to add an append-only table gets a sentence, not a Postgres
error.

## Unresolved issues

- No per-shift boundary: the period is "since the last close", so two
  receptionists sharing a day are measured together. Needs a shift concept
  before the variance can be attributed to one person.
- No alert when variance is `significant`. `design/operations.md` §2 wants it on
  the owner dashboard, not buried in a report.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer
- **Done:** variance computed, graded, recorded and reset across shifts; RBAC and
  append-only verified; the reset bug traced to the seed and fixed at both ends
- **Next:** TASK-010 Desk UI
- **Risks:** the period is still "since the last close", so two receptionists
  sharing a day are measured together. Needs a shift concept before a variance
  can be attributed to one person.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete
- [x] Handoff notes updated
