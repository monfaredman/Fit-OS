# TASK-012 — Offline check-in kiosk

| Field | Value |
|-------|-------|
| **Task ID** | TASK-012 |
| **Title** | Offline check-in kiosk + sync protocol |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Make the offline claim real. Until this exists the unplugged-cable demo in
`sales-kit.md` §2 — the thing that closes deals — cannot be given.

## Acceptance criteria

- [x] `GET /v1/sync/snapshot` — deltas by monotonic `rev`, full page on unknown `since`
- [x] `POST /v1/sync/check-ins` — batch flush; accepted and duplicate both succeed
- [x] Client timestamps clamped against clock skew
- [x] Unknown person rejected once, not retried forever
- [x] `apps/kiosk` — Vite PWA, IndexedDB cache + outbox, cache-first shell
- [x] The scan path makes **no** network call
- [x] Connection state permanently visible; «آفلاین» is not an error
- [ ] Not yet exercised with the network actually pulled — see Unresolved

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/offline-sync.md`](../../design/offline-sync.md) — the protocol
- [`design/tech-stack.md`](../../design/tech-stack.md) §3 — why this is not a Next.js route

## Files changed

| Path | Change |
|------|--------|
| `apps/api/src/sync/sync.service.ts` | snapshot deltas, outbox flush, `clampToPlausible` |
| `apps/api/src/sync/sync.test.ts` | 7 tests on clock skew |
| `apps/api/src/sync/sync.{controller,module}.ts` | two endpoints |
| `apps/kiosk/src/lib/outbox.ts` | IndexedDB snapshot cache + outbox |
| `apps/kiosk/src/lib/sync.ts` | pull/flush loop with backoff |
| `apps/kiosk/src/App.tsx` | the terminal |
| `apps/kiosk/vite.config.ts` | PWA, cache-first shell, `registerType: 'prompt'` |
| `packages/db/src/guards.test.ts` | cleanup fixed — was still using the D-009 pattern |

## Commands and tests executed

```bash
pnpm --filter @gymos/kiosk build   # 231 KB JS, 5 precached entries, sw.js emitted
REQUIRE_DB=1 pnpm test             # 205 tests, 11 tasks
pnpm typecheck                     # clean

# live
full snapshot   → 557 rows, rev 603, 173 KB for the whole gym
delta at head   → 0 rows
flush           → accepted=1
re-flush same   → duplicates=1, nothing double-posted
clock 3mo fast  → clamped=true, was_offline=true
unknown person  → PERSON_NOT_FOUND, rejected once
```

## Decisions and assumptions

- **Deltas key off a monotonic `rev`, never a timestamp.** The kiosk's clock is
  untrustworthy and the server's can move; a counter per location cannot. An
  unknown or too-old `since` returns `full: true` and the cache is replaced
  wholesale rather than left subtly incomplete.
- **There is no merge algorithm, because there is nothing to merge.** The
  decision is precomputed and a check-in is an append-only fact, so a replay is
  a duplicate to suppress. That is the entire reason this is tractable.
- **Accepted and duplicate are both success** from the client's view — it drops
  the event either way. Rejections are dropped rather than retried forever.
- **`registerType: 'prompt'`** — never auto-reload a kiosk mid-shift.
- The whole gym is 173 KB of snapshot. Caching it entirely is cheaper than any
  paging scheme would be.
- **The kiosk authenticates with a staff token, not a device secret.**
  `design/offline-sync.md` specifies per-device pairing; this is a deliberate
  deviation to keep scope contained. It is a real gap — see Unresolved.

## Unresolved issues

- **Not yet tested with the network genuinely pulled.** Every check above ran
  against a live server. The unplugged-cable demo needs a browser, IndexedDB and
  a physically disconnected machine. **Do not promise that demo until it has
  been rehearsed on the real hardware.**
- **Device pairing is not built.** The kiosk holds a 90-day staff token in
  `localStorage` on an unattended machine in a public room. `POST /auth/device/pair`
  and `device.secret_hash` already exist in the schema and the API design;
  wire them before a kiosk goes into a gym.
- Kiosk config (`token`, `locationId`, `deviceId`) is set by hand in
  `localStorage`. Needs a setup screen.
- Vazirmatn still not vendored; falls back to Tahoma.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer
- **Done:** sync protocol server-side and a kiosk PWA that builds; replay, skew
  clamping and rejection all verified against a live server
- **Next:** rehearse the offline demo on real hardware, then device pairing
- **Risks:** the staff-token shortcut is the one thing here I would not ship to a
  gym as-is.

## Definition-of-done checklist

- [ ] Acceptance criteria met — offline rehearsal outstanding
- [x] Relevant validation run
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete
- [x] Handoff notes updated
