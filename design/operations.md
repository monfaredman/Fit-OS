# GymOS — Operations

One VPS, one developer, real gyms depending on it. Everything here is sized for
that, not for a platform team.

---

## 1. The one alert that matters

**Check-in failure rate.** If the door stops working you need to know before the
gym phones you — that call is how accounts churn.

```
alert: checkin_error_rate > 2% over 5 min       → page immediately
alert: no check-ins from a live gym for 2 hours
       during its open hours                     → page
```

Everything else is email-tomorrow:

```
event backlog older than 10 min
SMS provider failures > 10% over 15 min
nightly backup did not complete
disk > 80%
p95 /search > 800ms over 15 min
ledger balance constraint violation              ← should be unreachable; if it fires, P1
```

Resist adding more. A solo founder with twelve alerts has zero alerts.

---

## 2. Metrics worth collecting

**Business — these are the product:**

| Metric | Why |
|---|---|
| Toman recovered per gym per month | The north star (`../product/prd.md` §5) |
| Arrears outstanding per gym, aged | What you sell against |
| Automation sends, by recipe, by outcome | Proves the engine works |
| Hold-out vs treated renewal rate | Makes the day-28 number credible |
| Activation: 5 consecutive check-in days | Predicts conversion |
| Check-ins per gym per day | **The churn signal — see §5** |

**Technical:**

```
http_request_duration_seconds{route}   p50/p95/p99
checkin_total{result="admitted|denied|offline"}
sync_flush_events_total{outcome}
sync_snapshot_staleness_seconds
automation_runs_total{recipe,status}
message_send_total{status}
event_queue_depth
ledger_transactions_total
```

Structured logs carrying `orgId`, `requestId`, `route`, `durationMs`. **Never
member PII** — `personId` only, never name or mobile.

---

## 3. Backups — a sales feature, so it must be real

`sales-kit.md` §3 promises *«هر لحظه بخواهید، تمام داده‌ها را می‌گیرید»*.

```
nightly  pg_dump --format=custom  →  separate provider, separate credentials
retain   7 daily · 4 weekly · 12 monthly
verify   restore into a scratch database MONTHLY, then run:
           - row counts per org
           - SELECT that every ledger_transaction sums to zero
           - one gym's arrears total vs the pre-backup value
```

**An untested backup is not a backup.** Put the monthly restore test in your
calendar, not your intentions.

Separately, the per-gym XLSX export in the app is the thing you actually demo.
It is never gated behind a plan tier — it is the reason switching *to* you feels
safe (`../product/principles.md` §8).

---

## 4. Deploy

```bash
git pull && docker compose up -d --build
```

Migrations run on boot, in a transaction, before the app accepts traffic.
`0001_guards.sql` is hand-written and applied in order alongside generated ones.

**Deploy window: 02:00–05:00 Tehran.** Gyms are closed. Never deploy during
16:00–22:00 — that is peak check-in, and a bad deploy there is a gym full of
people who cannot get in.

**Rollback:** keep the previous image tagged. `docker compose up -d` with the
old tag. Practise it once before you need it. Migrations are forward-only, so
every migration must be safe against the previous app version — add columns,
never drop or rename in the same release that stops using them.

---

## 5. Incidents

| Incident | First move |
|---|---|
| Check-in failing | Are kiosks offline-serving? If yes you have hours, not minutes. If no, roll back. |
| Ledger imbalance | Stop writes to that org. The transaction already rolled back, so no money moved. Reproduce in a test before touching production data. |
| Double SMS sent | Check `message.idempotencyKey` uniqueness. Tell the gym before they tell you. |
| Payment recorded twice | `Idempotency-Key` reuse. Correct with a **reversing** transaction, never a delete. |
| Gym reports wrong arrears | Recompute from `ledger_entry`. The snapshot is derived and always rebuildable. |
| Database down | Kiosks keep admitting members from cache. This is the dividend the offline design pays. |

**Communication rule:** when something breaks, tell the receptionist first,
then the owner. She is the one being embarrassed in front of members.

---

## 6. The churn signal

Check-ins per gym per day is a business metric disguised as a technical one.

```
< 60% of that gym's own 14-day average, 2 days running  → they are reverting
                                                          to the old system
zero for 2 days during open hours                       → critical, visit today
```

`../product/onboarding.md` lists this as the top failure signal. Instrument it
from day one — it is the earliest warning you get, and it arrives weeks before
the renewal conversation.

---

## 7. Support

The margin model in the strategy report assumes Iranian SMB support norms:
phone, WhatsApp, AnyDesk. Onboarding is 13–23 hours per gym.

- Named contact per gym. The receptionist has your number.
- Log every support contact with `orgId`, minutes, and category. **Support minutes per gym per month is a leading indicator of gross margin** — if it climbs, the 74% assumption is wrong and pricing needs revisiting.
- Recurring contact about the same thing is a product bug, not a support issue. Fix it once.

---

## 8. Security baseline

- App connects as `gymos_app` (`NOBYPASSRLS`). Never as the table owner — owners bypass RLS silently, which is how RLS ends up enabled and doing nothing.
- PSP keys in environment variables. Never in the repo, never in the database.
- Rate-limit login and member OTP by mobile.
- `auditLog` on every money action — not configurable, no feature flag.
- Device secrets hashed, per-device, rotatable.
- Quarterly: rotate credentials, review staff accounts across all orgs, confirm the RLS cross-tenant test still passes in CI.
