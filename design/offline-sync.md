# GymOS — Offline Sync Protocol

The hardest technical requirement in the product, and the one that wins demos
(`sales-kit.md` §2, minute 3). Everything here exists to make one claim true:

> **«اینترنت باشگاه قطع شود، پذیرش کار می‌کند.»**

---

## 1. Why it works: the decision is precomputed, the record is a fact

Two design choices make offline operation tractable rather than a distributed
systems problem:

**The admission decision is computed server-side, ahead of time.** The kiosk
never asks "may this person enter?" — it reads a cached boolean. If admission
required a server call, offline support would be a lie.

**A check-in is an append-only historical fact, not a mutation.** Two terminals
recording the same person is a duplicate to suppress, not a conflict to merge.
There is no correct-merge problem because nothing is ever overwritten.

Everything else follows from those two.

---

## 2. What the kiosk caches

`access_snapshot`, one row per active person at that location:

```json
{
  "personId": "…", "firstName": "علی", "lastName": "رضایی",
  "mobileLast4": "6789", "memberNo": 1042, "photoUrl": "…",
  "canEnter": true, "reasonCode": "ok",
  "membershipId": "…", "sessionsRemaining": 5,
  "arrearsRial": 4200000,
  "validUntil": "2026-09-27T14:15:00Z",
  "rev": 8814
}
```

Stored in IndexedDB. A 1,500-member gym is roughly 300 KB — trivial.

`validUntil` is short, **~15 minutes**. It bounds how stale a decision can be,
and it is the knob for the accepted trade-off in §6.

---

## 3. Snapshot sync — pull

```
GET /sync/snapshot?locationId=<id>&since=<rev>
```

```json
{
  "rev": 8861,
  "full": false,
  "upserts": [ { …snapshot rows… } ],
  "deletes": ["personId", …],
  "serverTime": "2026-09-27T14:02:11Z"
}
```

- **Monotonic `rev` per location**, not timestamps. Clocks on gym PCs are wrong; a counter cannot be.
- Client sends its last `rev`; server returns the delta.
- `since` unknown or too old → `full: true` and the complete set. Keep ~7 days of revision history, then force full.
- Poll every **60 s** while online, and immediately after any local write.
- `serverTime` lets the kiosk measure its own clock offset — see §7.

---

## 4. Check-in — the local path

```
scan → look up in IndexedDB → read canEnter → show result → append to outbox
```

No network in that path. Target under 2 seconds end to end, and it is entirely
local work, so it holds even on a bad connection.

The outbox record:

```json
{
  "clientEventId": "kiosk7:1727445731:a3f9",
  "personId": "…", "locationId": "…",
  "occurredAt": "2026-09-27T14:02:11Z",
  "method": "qr",
  "admitted": true, "denialReason": null,
  "snapshotRev": 8814,
  "deviceId": "…"
}
```

`clientEventId` = `{deviceId}:{unixSeconds}:{random}`. Generated locally, never
by the server, stable across retries. It maps to `check_in.clientEventId`, which
carries a unique index — so replay is a no-op at the database level, not just in
application code.

**Optimistic local effects.** On admit, the kiosk decrements
`sessionsRemaining` in its own cache immediately so a double scan shows the
right number. The server recomputes authoritatively; the next snapshot pull
corrects any drift. Never let the local guess persist past a sync.

---

## 5. Flush — push

```
POST /sync/check-ins
{ "deviceId": "…", "events": [ …up to 200… ] }
```

```json
{
  "accepted": ["kiosk7:1727445731:a3f9"],
  "duplicates": ["kiosk7:1727445600:7c21"],
  "rejected": [
    { "clientEventId": "…", "code": "PERSON_NOT_FOUND" }
  ],
  "rev": 8861
}
```

- **Accepted and duplicates are both success.** Delete from the outbox on either.
- `rejected` is rare and real — a person deleted between caching and flushing. Keep those locally, surface them to staff, don't retry forever.
- Flush on reconnect, then every 30 s while the outbox is non-empty.
- Backoff on 5xx: 1s, 2s, 4s … capped at 60 s. Never drop the outbox.
- Outbox survives reboot (IndexedDB) and has **no size cap** — a gym offline for a day must not lose its day.

---

## 6. The staleness trade-off — accept it, don't engineer around it

A member pays their arrears at the desk while the kiosk is offline. For up to
`validUntil` (~15 min) the kiosk may still show them as owing, or refuse them.

**Mitigations, in order:**
1. Short `validUntil`.
2. The Desk pushes a targeted snapshot refresh to kiosks at the same location after any money or membership write — arrives instantly when online, which is the common case.
3. **Manual override is always available** and recorded as `method: "manual"` with the staff id.

Do not try to solve this perfectly. It is rare, the manual path is correct, and
`receptionist-flow.md` §4 already says it: *don't make staff fight the software —
they will find a way around it, and you'll lose the audit trail entirely.*

---

## 7. Clock skew

Gym PCs have wrong clocks. A check-in stamped in the future or an hour ago
corrupts attendance reports and the personal baselines that `lapsed_14d` depends on.

- Kiosk records `occurredAt` from its own clock **and** computes an offset from `serverTime` on every snapshot pull.
- Server **clamps** `occurredAt` to `[receivedAt − offlineDuration − 5min, receivedAt]`.
- Offset over 5 minutes: flag the device, show a banner, tell the gym to fix the clock.
- Store the raw client value alongside the clamped one so a support investigation can see what actually happened.

Same rule as the hardware bridge (`hardware-bridge.md` §4), same reason.

---

## 8. What is deliberately NOT offline

| Works offline | Requires network |
|---|---|
| Check-in (admit + deny) | Taking a payment |
| Reading the member card | Selling a membership |
| Seeing arrears and sessions | Buffet sale |
| Manual override | Registering a new member |

**Money never moves offline.** A cash payment recorded on a disconnected
terminal and lost is unrecoverable, and the ledger's integrity is worth more
than the convenience. The desk shows `آفلاین — امکان دریافت وجه نیست` and staff
write it on paper, exactly as they do today when their current software is down.

This boundary is worth stating plainly in the demo. Claiming full offline
operation and then losing a payment destroys the trust the feature was meant to build.

---

## 9. Tests (from `tech-stack.md` §5, item 4)

1. Replaying the same `clientEventId` twice creates one row.
2. Events arriving out of order produce correct `sessionsUsed`.
3. A 24-hour offline period flushes completely, in order, with no loss.
4. A clock 3 hours fast is clamped, flagged, and does not corrupt the daily report.
5. A snapshot pull with an unknown `since` returns `full: true` and the client recovers.
6. Killing the browser mid-flush loses nothing.
7. A person deleted server-side while cached produces a clean `rejected`, not a crash.
