# TASK-013 — Device pairing

| Field | Value |
|-------|-------|
| **Task ID** | TASK-013 |
| **Title** | Device pairing — kiosk credentials that are not staff tokens |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Close the gap TASK-012 opened. A kiosk was holding a 90-day **staff** token in
`localStorage` on an unattended machine in a public room — a token that can take
payments. A device credential must reach the two sync endpoints and nothing else.

## Acceptance criteria

- [x] `POST /v1/devices/pair-code` — staff mint a six-digit code, gated on `org.manage`
- [x] `POST /v1/auth/device/pair` — unauthenticated redeem, single use, 10-minute expiry
- [x] Device credential works on `/v1/sync/*`
- [x] Device credential is **rejected** everywhere else
- [x] A device is pinned to its own location regardless of what it requests
- [x] `DELETE /v1/devices/:id` revokes immediately
- [x] Only hashes stored — plaintext code and secret are each returned exactly once
- [x] Kiosk uses `Authorization: Device <secret>`

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/api-design.md`](../../design/api-design.md) — device endpoints
- [`design/offline-sync.md`](../../design/offline-sync.md) — the kiosk's needs

## Files changed

| Path | Change |
|------|--------|
| `packages/db/drizzle/0004_device_pairing.sql` | pairing columns + 2 SECURITY DEFINER functions |
| `packages/db/src/schema.ts` | `device` pairing/revocation columns; `secretHash` nullable |
| `apps/api/src/auth/device-auth.guard.ts` | `DeviceAuthGuard`, code/secret generation |
| `apps/api/src/sync/sync-auth.guard.ts` | accepts either credential; pins a device to its location |
| `apps/api/src/devices/devices.service.ts` | mint, redeem, list, revoke, heartbeat |
| `apps/api/src/devices/devices.controller.ts` | four endpoints |
| `apps/kiosk/src/lib/sync.ts`, `src/App.tsx` | `Device` scheme instead of `Bearer` |

## Commands and tests executed

```bash
pnpm db:migrate                # 0004 applied
pnpm build && pnpm typecheck   # 7 + 11 tasks, clean
REQUIRE_DB=1 pnpm test         # 205 tests

# live
receptionist mints a code        → 403 (org.manage)
owner mints a code               → 087661, 10-minute expiry
kiosk redeems, no auth header    → 43-char secret, device + location
same code again                  → UNAUTHENTICATED (single use)
device cred → /v1/sync/snapshot  → 557 rows
device cred → POST /v1/payments  → 401
device cred → GET  /v1/arrears   → 401
revoke                           → 204, next sync call 401
```

## Decisions and assumptions

- **A device is not a person.** `DevicePrincipal` carries no `staffId`, no role
  and no capabilities, so there is nothing for a future endpoint to accidentally
  authorise. The credential can only reach routes that explicitly accept it.
- **`Authorization: Device <secret>`**, a distinct scheme from `Bearer`. The
  guard branches on the scheme, so a device secret sent as a bearer token fails
  rather than being tried against the session table.
- **A device is pinned to its own location**, overriding whatever the request
  body claims. A compromised kiosk cannot read another branch's members.
- **Redeem is one atomic statement** that burns the code as it mints the secret,
  so two concurrent attempts cannot both succeed.
- **Wrong, expired and already-used codes are indistinguishable.** The endpoint
  is unauthenticated by necessity; it must not become an oracle for which codes
  exist.
- Six digits because an installer types it once under time pressure and may be
  reading it aloud over a phone. Safe because it lives ten minutes and is
  single-use — the entropy that matters is in the 256-bit secret it mints.
- **D-011:** two more SECURITY DEFINER functions, for the same RLS bootstrap
  reason as D-010. That is now four in total, each keyed on an unguessable hash
  and returning at most one row. Any change to them is a security review.

## Unresolved issues

- The kiosk still has no setup screen: `deviceSecret` and `locationId` go into
  `localStorage` by hand. The endpoints exist; the UI does not.
- `POST /v1/devices/heartbeat` is implemented in the service but not exposed as
  a route, so `clock_offset_ms` and `last_seen_at` are never populated by a real
  device. Needed before the operator can see a drifting clock.
- **The offline path still has not been rehearsed with the network pulled.**
  Carried from TASK-012 and unchanged — this remains the single most important
  untested claim in the product.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer
- **Done:** pairing end to end; a device credential cannot take a payment or
  read another location; revocation is immediate
- **Next:** kiosk setup screen + heartbeat route, then rehearse the offline demo
- **Risks:** none outstanding on this task. The unrehearsed offline demo remains
  the product's biggest untested claim.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete
- [x] Handoff notes updated
