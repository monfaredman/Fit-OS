# TASK-009 — Check-in & access snapshot

| Field | Value |
|-------|-------|
| **Task ID** | TASK-009 |
| **Title** | Check-in & access snapshot |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

Admit a member from a precomputed decision — the design that makes offline possible.

## Acceptance criteria

- [ ] `POST /v1/check-ins` — admit/deny read from `access_snapshot`, never a live computation
- [ ] Unique on `(org_id, client_event_id)`; replay is a no-op, not an error
- [ ] Session consumption decrements and recomputes the snapshot
- [ ] Manual override recorded as `method='manual'` with the staff id
- [ ] Denial reasons: `expired` · `arrears` · `no_sessions` · `frozen` · `wrong_gender_block`
- [ ] `GET /v1/check-ins?date=` today's feed
- [ ] Append-only trigger rejects `UPDATE check_in` (test)
- [ ] Snapshot recompute is a pure, tested function

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
