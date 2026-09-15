# GymOS — Hardware Bridge Agent

**Status: specified, not scheduled.** Out of the solo MVP. Build after the first
paying customers, or earlier if the gym visits show one controller model
dominates.

Strategic weight is high — the strategy report names this as the switching
unlock — but it cannot be designed until the week-1 teardown says what the
controllers actually speak.

---

## 1. Why it's a separate binary

The agent runs on the gym's reception PC: an old Windows machine, possibly
XP-era, administered by nobody.

**Go, compiled to a single `.exe`.** No runtime to install, no Node, no Python,
no .NET version roulette. Installs as a Windows service and starts on boot.

This is worth stepping outside your TypeScript stack for. Install friction on an
unmanaged reception PC is the entire battle — every dependency you require is a
support call and a reason the gym gives up.

---

## 2. Architecture

```
controller ──poll──> agent ──> local SQLite outbox ──HTTPS──> GymOS API
     ^                 │
     └──unlock (v2)────┘
```

- **Poll, don't listen.** Controllers rarely push. Poll every 5–15 s for new records.
- **Local SQLite outbox** is mandatory. The PC's internet will drop, and unsent events must survive a reboot.
- **Outbound HTTPS only.** Never require an inbound port or a static IP — you will not get either.
- **Idempotent pushes** keyed on `(deviceId, controllerRecordId)`, mapped to `check_in.clientEventId`.

### v1 — read only
Pull attendance records, push to GymOS. Enough to migrate a gym off its desktop
software while keeping the existing door hardware physically unchanged. **This
alone delivers most of the strategic value.**

### v2 — write
Remote unlock, locker lock control, enrolling a fingerprint from GymOS. Higher
risk: a bug leaves a door open or locks members out. Gate behind a feature flag
per device and a manual override on the physical unit.

---

## 3. Failure modes — all of them must be handled

| Failure | Behaviour |
|---|---|
| Network down | Queue locally, retry with backoff, surface `◐ آفلاین` in the Desk UI |
| PC reboots | Service auto-starts, outbox intact, resumes from last record id |
| Controller unreachable | Log, alert after 15 min, keep retrying. Do not crash |
| **Controller clock drift** | See §4 — the subtle one |
| Duplicate records after a controller reset | Dedupe on `(deviceId, controllerRecordId)` |
| Controller record ids reset to zero | Detect a decrease, switch to content-hash dedupe, alert |
| Agent version outdated | Report `agentVersion` on every push; server warns |

---

## 4. Clock skew — the bug you'll chase for a week

Controller clocks drift, often by minutes, sometimes by hours, and are reset by
power cuts. A check-in stamped in the future or an hour ago corrupts attendance
reports and the `lapsed_14d` baselines.

**Handling:**
- Agent records both `controllerTimestamp` and its own `agentReceivedAt`.
- Server stores `occurredAt` from the controller but **clamps it** to the plausible window `[agentReceivedAt − pollInterval − skewAllowance, agentReceivedAt]`.
- Persist the observed offset per device; if it exceeds 5 minutes, flag it and tell the gym to reset the controller clock.
- If the agent can set the controller clock, sync it nightly from NTP.

---

## 5. Authentication & install

- Each agent gets a `device` row with a per-device secret (`device.secretHash`). Never share one credential across gyms.
- Install: you generate a short pairing code in GymOS, the installer types it once, the agent exchanges it for a long-lived secret. No config files with credentials in them.
- Agent pushes `controllerModel` on first contact. **Collect this across all customers — the list tells you which controller to support next, ranked by real demand rather than guesswork.**

---

## 6. Blocked until the teardown

Unknown, and unresolvable from a desk:

1. Which controllers dominate the target gyms — `gym-visit-script.md` collects model numbers and photographs
2. Protocol per model: TCP, serial, a vendor SDK DLL, or a local database file
3. Whether protocols are documented, reverse-engineerable, or sealed
4. Whether vendors will talk to you — **an installer partner may simply hand you the SDK, which is another reason the installer channel matters**

**If protocols turn out to be sealed:** fall back to reading the incumbent
software's own database for attendance, on a schedule. Uglier, still enough to
migrate a gym. Do not let a sealed protocol kill the deal.
