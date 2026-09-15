# TASK-009 — Check-in & access snapshot

| Field | Value |
|-------|-------|
| **Task ID** | TASK-009 |
| **Title** | Check-in & access snapshot |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Admit a member from a precomputed decision — the design that makes offline possible.

## Acceptance criteria

- [x] `POST /v1/check-ins` — admit/deny read from `access_snapshot`, never a live computation
- [x] Unique on `(org_id, client_event_id)`; replay is a no-op, not an error
- [x] Session consumption decrements and recomputes the snapshot
- [x] Manual override recorded as `method='manual'` with the staff id
- [x] Denial reasons: `expired` · `arrears` · `no_sessions` · `frozen` · `wrong_gender_block`
- [x] `GET /v1/check-ins?date=` today's feed
- [x] Append-only trigger rejects `UPDATE check_in` (test)
- [x] Snapshot recompute is a pure, tested function

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/offline-sync.md`](../../design/offline-sync.md)

## Out of scope

`GET /sync/snapshot` and `POST /sync/check-ins` — those ship with the kiosk (TASK-012).

## Implementation plan

1. `checkins.module/controller/service`
2. `access-snapshot.ts` pure module: (membership, arrears, plan, time) → decision + reason + validUntil
3. Recompute hooks on membership/payment/freeze writes
4. Arrears policy configurable per org: block · warn · grace threshold

## Files changed

| Path | Change |
|------|--------|
| `apps/api/src/checkins/checkins.service.ts` | admit/refuse from the snapshot, replay, override, feed |
| `apps/api/src/checkins/checkins.{controller,module}.ts` | `POST/GET /v1/check-ins` |
| `apps/api/src/access/access-snapshot.service.ts` | now includes `expired` memberships — see below |

## Commands and tests executed

```bash
REQUIRE_DB=1 pnpm test        # 188 tests, 9 tasks
pnpm typecheck && pnpm build  # clean

# live, against the seeded gym
check in                       → admitted, sessions 12/12 → 11/12
replay same clientEventId      → duplicate:true, sessions STAY 11/12
expired member                 → admitted:false, reason:expired
receptionist override          → admitted:true, recorded with staff id
trainer override               → refused (no checkin.override capability)
GET /v1/check-ins              → today's feed, overrides flagged
ledger imbalance               → 0
```

## Decisions and assumptions

- The decision is **read from `access_snapshot`**, never computed live. Not an
  optimisation — it is what makes offline check-in possible, and it means the
  desk and a disconnected kiosk cannot disagree about who may enter.
- A replayed `clientEventId` returns the original result with `duplicate: true`
  and consumes no second session. That is what lets an offline outbox flush
  safely, and it is enforced by the unique index, not by application code.
- Override is available to staff holding `checkin.override` and is recorded with
  the staff id. Never make staff fight the software — they work around it and
  you lose the audit trail entirely.
- **Snapshot recompute now includes `expired` memberships.** It previously
  matched only `active`/`frozen`, so a lapsed member was indistinguishable from
  someone who never joined and the reason collapsed to `no_membership` — which
  sends the receptionist toward signup instead of renewal. Ordering puts a live
  membership ahead of a lapsed one.
- **A backtick inside a SQL comment terminates the enclosing JS template
  literal.** `-- \`expired\` is included` turned the word into JS and threw
  "expired is not defined" at runtime, not compile time. No backticks in SQL
  strings.

## Unresolved issues

- `GET /sync/snapshot` and `POST /sync/check-ins` are not built — those ship
  with the kiosk (TASK-012). The server side they depend on now exists.
- Clock skew is modelled (`device.clock_offset_ms`, `check_in.occurred_at` vs
  `synced_at`) but `occurredAt` is not yet clamped to a plausible window. Needed
  before any device can post its own timestamps — `design/offline-sync.md` §7.
- Gendered time blocks are in the reason enum but no schedule drives them.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-010)
- **Done:** check-in, replay, override, feed — the backend vertical slice is complete
- **Next:** TASK-010 Desk UI, or pull drawer close forward (see risk)
- **Risks:** drawer close and variance still are not built. That is the fraud
  control that makes the capability matrix meaningful: receptionists cannot write
  off arrears, but without a nightly variance report the cash-skimming path in
  design/permissions.md §2 stays open. Worth doing before a real gym uses this.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
