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
- [ ] **Post-close reset is wrong — see Unresolved**

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

## Unresolved issues

- **The post-close reset is wrong.** After closing, `drawer/current` reported
  87,660,000 T rather than starting near zero. The figure *dropped* from
  172,250,000, so the `period_to` boundary is partly taking effect but is not
  filtering cleanly. Suspect the `occurred_at > since` comparison against
  backdated seed transactions, or more than one `cash_drawer` account for the
  same location. **Diagnose before this is used anywhere real** — a wrong
  expected figure accuses the wrong person.
- No per-shift boundary: the period is "since the last close", so two
  receptionists sharing a day are measured together. Needs a shift concept
  before the variance can be attributed to one person.
- No alert when variance is `significant`. `design/operations.md` §2 wants it on
  the owner dashboard, not buried in a report.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer
- **Done:** variance computed, graded and recorded; RBAC and append-only verified
- **Next:** fix the post-close reset, then TASK-010 Desk UI
- **Risks:** the unresolved reset bug makes the expected figure untrustworthy
  across shift boundaries. The single-shift case is correct.

## Definition-of-done checklist

- [ ] Acceptance criteria met — one outstanding
- [x] Relevant validation run
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete
- [x] Handoff notes updated
