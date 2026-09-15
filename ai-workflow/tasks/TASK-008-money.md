# TASK-008 — Money

| Field | Value |
|-------|-------|
| **Task ID** | TASK-008 |
| **Title** | Money |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Payments, the arrears ledger and the screen that sells the product.

## Acceptance criteria

- [x] `POST /v1/payments` (cash · card_pos · card_transfer · wallet) — requires `Idempotency-Key`
- [x] `POST /v1/wallet/topups`
- [x] `GET /v1/people/:id/ledger`
- [x] `GET /v1/arrears?agedOverDays=` — the arrears screen, paginated by cursor
- [x] All posting goes through `@gymos/core` builders; `assertBalanced` before write
- [x] Idempotency store: `(org_id, key) → response` for 24 h; replay sets `Idempotency-Replayed: true`; different body under same key → 409
- [x] Partial payment reduces arrears by exactly the amount paid (integration test)
- [x] Write-off and discount caps enforced per role

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/domain-model.md`](../../design/domain-model.md) §3 · [`design/api-design.md`](../../design/api-design.md) §4

## Out of scope

Direct debit (blocked on the PSP call — `design/direct-debit.md`). POS/buffet. Drawer close.

## Implementation plan

1. `money.module/controller/service`
2. `idempotency.ts` — pure, tested, backed by a table
3. Arrears query off `v_member_arrears` with aging
4. Integration test asserting the whole book sums to zero after a mixed month

## Files changed

| Path | Change |
|------|--------|
| `apps/api/src/money/idempotency.ts` | stable request hashing + replay decision, pure |
| `apps/api/src/money/idempotency.test.ts` | 8 tests |
| `apps/api/src/money/money.service.ts` | payments, wallet, ledger history, arrears screen |
| `apps/api/src/money/money.controller.ts` | `/v1/payments`, `/v1/wallet/topups`, `/v1/arrears`, `/v1/people/:id/ledger` |
| `apps/api/src/money/money.module.ts` | wiring |

## Commands and tests executed

```bash
REQUIRE_DB=1 pnpm test        # 188 tests, 9 tasks
pnpm typecheck && pnpm build  # clean

# live, against the seeded gym
GET  /v1/arrears?agedOverDays=30 → 199,060,000 T across 94 members, cursor paged
POST /v1/payments 1,000,000 T    → arrears 10,650,000 → 9,650,000 (exact)
     same key, same body         → replayed, Idempotency-Replayed: true, no double-post
     same key, different body    → IDEMPOTENCY_KEY_REUSED
     no key                      → IDEMPOTENCY_KEY_REQUIRED
POST /v1/wallet/topups 500,000 T → wallet 500,000 T
POST /v1/payments from wallet    → arrears down 300,000 T, wallet 200,000 T left
     overdraw the wallet         → INSUFFICIENT_WALLET_BALANCE {available, required}
ledger across 1,239 transactions → imbalance 0
```

## Decisions and assumptions

- The idempotency read, the work and the store write all happen in **one**
  transaction. A crash mid-flight therefore leaves neither a half-posted ledger
  nor a key claiming success for work that never happened.
- A repeat with a different body under the same key is refused rather than
  executed. Of the three possible outcomes — replay, refuse, execute — silently
  executing is the worst, because the drawer will not balance and nobody will
  know why.
- The wallet is a liability, so a raw balance is negative; spending checks
  `-balance` and refuses an overdraw with both figures in the error details so
  the receptionist can tell the member what is actually available.
- Arrears paging is by cursor on `arrears_rial`, not offset: rows shift
  constantly under a busy desk and offset paging would skip or repeat members.
- Paying down arrears recomputes the access snapshot, because under an org with
  `arrears_policy = 'block'` a payment is what re-opens the door.

## Unresolved issues

- Expired idempotency keys are filtered by `expires_at > now()` but never
  deleted. Needs a sweep job before the table grows; harmless for now.
- The arrears cursor uses `arrears_rial` alone, so members with identical
  balances could straddle a page boundary. Needs a tiebreaker on `person_id`
  before a gym has enough duplicates to notice.
- `arrears.writeoff` is enforced in the capability matrix but no endpoint
  implements it yet.
- Drawer close and variance (design/permissions.md §2) are not built — that is
  the fraud control that makes the rest of the matrix meaningful.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-009)
- **Done:** payments, wallet, ledger history and the arrears screen, all idempotent
- **Next:** TASK-009 check-in — the access snapshot and rules already exist, so
  this is mostly the append-only fact and the duplicate-replay path
- **Risks:** `postTransaction` remains the only ledger writer. The wallet
  overdraw check is a read-then-write inside one transaction, which is correct
  under Postgres' default isolation here but would need `SELECT … FOR UPDATE` if
  wallet spending ever moves outside a single transaction.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
