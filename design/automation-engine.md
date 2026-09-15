# GymOS — Automation Engine

The runtime under the six recipes in `automation-recipes.md`. Ships in the MVP
because Retention Intelligence — the thing you sell — runs on it.

**Build the engine, not the canvas.** The visual workflow builder is P2
(`design`-wide decision, `../product/scope-freeze.md`). Six hardcoded recipes
with on/off toggles capture ~90% of the value at ~10% of the cost.

---

## 1. Two trigger sources, both required

| | Reactive | Proactive |
|---|---|---|
| Example | "member checked in" | "membership expires in 7 days" |
| Source | `event` table (transactional outbox) | `scheduled_trigger` table |
| Written | Same transaction as the state change | Materialised when the membership is written |

A single mechanism cannot serve both, and most implementations get the proactive
half wrong by scanning tables nightly.

### Why not a nightly scan

`SELECT … WHERE ends_at BETWEEN now()+6d AND now()+7d` looks simpler and is worse:
it scans every membership every night, it silently misses memberships edited
between runs, and it double-fires when the job is re-run after a failure.

**Materialise instead.** On every membership insert or update:

```sql
UPDATE scheduled_trigger SET superseded_at = now()
 WHERE ref_table = 'membership' AND ref_id = :id AND fired_at IS NULL;

INSERT INTO scheduled_trigger (org_id, kind, person_id, ref_table, ref_id, fire_at)
VALUES (:org, 'membership_expiring', :person, 'membership', :id, :endsAt - interval '7 days'),
       (:org, 'membership_expiring', :person, 'membership', :id, :endsAt - interval '1 day');
```

Supersede-then-insert, in the same transaction as the membership write. A
membership whose `endsAt` moves — a freeze, a correction — reschedules itself
atomically. The worker then reads one tiny index range instead of a table scan.

---

## 2. The outbox

Domain events are written **in the same transaction** as the state change they
describe. Never publish from application code after a commit — that loses events
exactly when the process crashes.

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SET LOCAL app.org_id = ${orgId}`)
  const m = await tx.insert(membership).values(...).returning()
  await tx.insert(event).values({ orgId, type: 'membership.created', personId, payload: {...} })
  await scheduleExpiryTriggers(tx, m)   // §1
})
```

Event types the MVP emits:

```
person.created           membership.created      membership.renewed
membership.frozen        membership.expired      checkin.recorded
payment.received         arrears.aged            member.lapsed
```

---

## 3. The worker

One process, one loop, `SKIP LOCKED`. No Redis, no broker — Postgres is the queue
(`tech-stack.md` §1).

```sql
-- claim a batch; concurrent workers never collide
SELECT * FROM event
 WHERE processed_at IS NULL
 ORDER BY occurred_at
 FOR UPDATE SKIP LOCKED
 LIMIT 50;
```

Loop, every 30 seconds:

1. Claim due `scheduled_trigger` rows (`fired_at IS NULL AND superseded_at IS NULL AND fire_at <= now()`)
2. Claim unprocessed `event` rows
3. For each, find enabled `automation` rows matching the recipe key
4. **Re-evaluate the condition now, against live data** — see §4
5. Apply suppression (§5)
6. Insert `automation_run` with its idempotency key; unique violation = already done, skip silently
7. Render and enqueue the `message`
8. Mark processed

Idempotency key formats, exactly as `automation-recipes.md` specifies:

```
expiry7:{membershipId}
expiry1:{membershipId}
arrears:{personId}:{jalaliYm}:{bucket}
lapsed:{personId}:{jalaliYm}
bday:{personId}:{jalaliYear}
firstweek:{membershipId}
```

The unique index on `automation_run.idempotencyKey` is the real guarantee.
Application checks are an optimisation; the constraint is the contract.

---

## 4. Re-evaluate at fire time, never at schedule time

The most important rule in this document.

A trigger scheduled seven days ago says nothing about now. Between scheduling
and firing, the member may have renewed, frozen, paid, or left.

```ts
// Fires for expiry_1d — but only if all of this is still true.
const stillDue =
  membership.status === 'active' &&
  !hasSuccessorMembership(personId) &&
  !isFrozen(membership) &&
  !person.optedOut
```

`arrears_reminder` has the sharpest version: **check the balance again before
sending.** A member who paid cash at the desk this morning must not get a debt
SMS this afternoon. That single message will cost you the gym's trust in the
whole feature, and they will turn it off.

Same rule appears in `direct-debit.md` §4 step 2, for the same reason.

---

## 5. Suppression — ship this before enabling a third recipe

Order of checks, all of them, every time:

```
1. person opted out?              → suppress
2. membership frozen?             → suppress
3. official holiday and recipe is not birthday/arrears? → suppress
4. ≥2 automated messages to this person in 7 days? → suppress
5. another recipe already fired for this person today?
     → keep the higher priority, suppress the other
6. outside 09:00–21:00 Tehran?    → queue, flush at 09:00
7. SMS credit exhausted?          → hold, alert the gym, do not drop
```

Priority: `arrears_reminder` > `expiry_1d` > `expiry_7d` > `lapsed_14d` >
`first_week` > `birthday`.

Suppressed runs are **recorded** with `status='suppressed'` and a reason, not
discarded. When a gym asks why a member wasn't messaged, you need the answer.

> Without rule 5 you will send one member three messages before lunch, the gym
> will get the complaint, and they will disable the feature. That is the failure
> mode this engine exists to avoid.

---

## 6. Sending

`message` rows are queued, then drained by the same worker:

- One `idempotencyKey` per message; unique index enforces single-send.
- Provider call wrapped in a timeout. On ambiguous failure (timeout, 5xx), **do not resend** — mark `unknown`, reconcile from the provider's delivery report. Resending on timeout is how a gym gets billed twice and a member gets two texts.
- Decrement `sms_credit_ledger` on accepted-by-provider, not on enqueue.
- Persian body ⇒ 70 chars/segment; store `segments` and `costRial` per message so the gym's bill is explainable line by line.

---

## 7. Retention Intelligence — nightly, rules only

Runs at 03:00 Tehran, recomputes `risk_score` for every active member.

```ts
const reasons = []
if (daysToExpiry <= 7)            reasons.push({ code: 'expiring',        detail: `اشتراک ${daysToExpiry} روز دیگر` })
if (arrearsRial > 0 && age > 7)   reasons.push({ code: 'arrears',         detail: `${fmt(arrearsRial)} — ${age} روز` })
if (recentVisits < baseline*0.5)  reasons.push({ code: 'attendance_drop', detail: `${recentVisits} بازدید در ۱۴ روز، معمول ${baseline}` })
if (daysSinceLastVisit >= 14)     reasons.push({ code: 'absent',          detail: `${daysSinceLastVisit} روز` })
if (isFirstMonth && visits <= 1)  reasons.push({ code: 'no_second_visit', detail: 'فقط یک بار آمده' })
```

**`baseline` is the member's own history**, not a global threshold. A member who
always trained twice a month and hasn't come in 14 days is behaving normally.
Comparing against themselves is what makes this useful without a model — and
it's the honest version of "churn prediction" with no training data
(`../product/prd.md` §8).

`reasons` is the deliverable. A score with no explanation is unsellable: the
product promises *detect → explain → recommend → automate*.

---

## 8. The hold-out

10% of eligible members per gym, excluded from `expiry_7d` and
`arrears_reminder` for the first 90 days.

- Assign deterministically: `hash(personId + orgId) % 10 === 0`. Stable across restarts, no stored flag to drift.
- Suppressed runs recorded with `reason='holdout'` — that's how you count the control group.
- Auto-expire at day 90. Keeping it longer costs the gym real money.

This is what turns *"we recover money"* into *"members we chased renewed at 61%
against 44%"* at the day-28 conversation (`../product/onboarding.md`). Without
it the number is a claim.

---

## 9. Failure behaviour

| Failure | Behaviour |
|---|---|
| Worker dies mid-batch | `SKIP LOCKED` + unclaimed rows: next run picks them up |
| Worker runs twice | Idempotency keys make the second a no-op |
| SMS provider down | Messages stay queued, backoff, alert after 15 min |
| Recipe throws on one member | Catch per member, record the failure, continue the batch |
| Event backlog grows | Alert on unprocessed events older than 10 minutes |
| A gym's credit runs out | Hold messages, notify the gym, resume on top-up. **Never drop** |
