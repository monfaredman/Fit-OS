# TASK-008 — Money

| Field | Value |
|-------|-------|
| **Task ID** | TASK-008 |
| **Title** | Money |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

Payments, the arrears ledger and the screen that sells the product.

## Acceptance criteria

- [ ] `POST /v1/payments` (cash · card_pos · card_transfer · wallet) — requires `Idempotency-Key`
- [ ] `POST /v1/wallet/topups`
- [ ] `GET /v1/people/:id/ledger`
- [ ] `GET /v1/arrears?agedOverDays=` — the arrears screen, paginated by cursor
- [ ] All posting goes through `@gymos/core` builders; `assertBalanced` before write
- [ ] Idempotency store: `(org_id, key) → response` for 24 h; replay sets `Idempotency-Replayed: true`; different body under same key → 409
- [ ] Partial payment reduces arrears by exactly the amount paid (integration test)
- [ ] Write-off and discount caps enforced per role

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
