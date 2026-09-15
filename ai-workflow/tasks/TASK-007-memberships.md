# TASK-007 — Plans & memberships

| Field | Value |
|-------|-------|
| **Task ID** | TASK-007 |
| **Title** | Plans & memberships |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Sell, freeze and renew memberships, including the session-count model that dominates Iranian gyms.

## Acceptance criteria

- [x] `GET /v1/plans`; `POST /v1/memberships`
- [x] Plan kinds: `duration` · `session_count` · `hybrid` · `open`
- [x] `POST /v1/memberships/:id/freeze` and `/unfreeze` — freeze extends `endsAt` by credited days
- [x] `POST /v1/memberships/:id/renew`
- [x] Selling posts a balanced `membership_sale` ledger transaction with the discount on its own account
- [x] Expiry arithmetic uses `@gymos/core` `addDays` — 31-day month boundaries covered by tests
- [x] `jalaliYm` denormalised on write

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
| `apps/api/src/memberships/membership-rules.ts` | pure expiry, freeze credit, door decision |
| `apps/api/src/memberships/membership-rules.test.ts` | 25 tests |
| `apps/api/src/memberships/memberships.service.ts` | sell · freeze · unfreeze · renew, with ledger posting |
| `apps/api/src/memberships/memberships.{controller,module}.ts` | `/v1/plans`, `/v1/memberships/*` |
| `apps/api/src/access/access-snapshot.service.ts` | recompute the precomputed door decision |
| `apps/api/src/access/access.module.ts` | global — every write that changes the answer needs it |
| `apps/api/src/infra/ledger-accounts.ts` | lazy, idempotent account resolution |
| `apps/api/src/infra/ledger-post.ts` | writes a `@gymos/core` Transaction, asserts balanced first |
| `apps/api/src/people/people.service.ts` | sets `home_location_id` on create |

## Commands and tests executed

```bash
REQUIRE_DB=1 pnpm test        # 180 tests, 9 tasks
pnpm typecheck && pnpm build  # clean

# live, against the seeded gym
GET  /v1/plans                    → 6 plans, session_count and duration
POST /v1/people → /v1/memberships → member_no 1600, stage active,
                                     12/12 sessions, expiry +30d,
                                     arrears exactly 2,000,000 T
                                     (2,200,000 list − 200,000 discount)
POST /memberships/:id/freeze      → 204, access False/frozen
POST /memberships/:id/unfreeze    → 204, expiry 10-14 → 10-19 (+5d credited)
discount 50% as receptionist      → DISCOUNT_EXCEEDS_CAP {maxRial, capPct:20}
ledger imbalance across 1,236 txns → 0
```

## Decisions and assumptions

- The door decision lives in `membership-rules.ts`, not the check-in path, so
  TASK-009 reuses it rather than reimplementing it. Structural reasons
  (no membership → frozen → expired → no sessions) are reported **before**
  money: a member whose subscription lapsed is not "in arrears", and telling the
  receptionist the wrong reason sends them down the wrong path at the desk.
- Arrears default to `warn`, not `block`. Hard-blocking a paying customer over a
  small balance generates the angry phone calls that get a feature switched off;
  both the policy and the grace threshold are per-organization.
- Renewal starts the day *after* the current period, never mid-period — that
  would silently shorten what the member paid for.
- Ledger accounts are created lazily with an existence check plus
  `ON CONFLICT DO NOTHING`. Two concurrent sales for one member must not create
  two receivable accounts, which would split their arrears and be nearly
  impossible to spot.
- **Drizzle's raw `execute` does not serialise a JS `Date`** for postgres.js —
  it must be `.toISOString()`. The query builder does this for you; `execute`
  does not. Cost one debugging cycle.

## Unresolved issues

- `renew()` opens two transactions (read the current membership, then sell).
  Harmless today, but it should be one — a membership cancelled between the two
  would produce a renewal of something that no longer exists.
- Trainer commission is modelled (`membership.trainer_id`,
  `trainer_commission_rule`) but not calculated. V1.
- Freeze has no maximum duration or per-year cap. Real gyms limit both; needs a
  policy decision from the design-partner visits.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-008)
- **Done:** plans, sell with balanced ledger posting, freeze/unfreeze with day credit, renew
- **Next:** TASK-008 money — payments, wallet, arrears screen, idempotency
- **Risks:** `postTransaction` is now the only path that writes to the ledger.
  Keep it that way; a second writer is how the invariant erodes.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
