# GymOS — MVP Automation Recipes

Six recipes. No visual builder — each is a toggle with editable copy, per the
strategy. Together they are the product's entire sales pitch: *"we tell you who
owes you money and who's about to leave, and we chase them for you."*

---

## 0. Constraints that shape every recipe

### Persian SMS costs double

Persian text forces UTF-16 encoding: **70 characters per segment**, 67 for each
part of a multi-part message — against 160 for Latin. Almost every useful
Persian message is 2 segments.

Some Iranian businesses transliterate to Finglish to halve the cost.
**Don't.** It reads as cheap, and the gyms you're targeting are selling a
premium-ish service. Budget 2 segments and move on.

Monthly volume for a 600-member gym, all six recipes enabled:

| Recipe | Est. sends/mo | Segments |
|---|---:|---:|
| `expiry_7d` | 600 | 1,200 |
| `expiry_1d` | 240 | 480 |
| `arrears_reminder` | 180 | 360 |
| `lapsed_14d` | 90 | 180 |
| `birthday` | 50 | 50 |
| `first_week` | 24 | 48 |
| **Total** | **~1,184** | **~2,318** |

Multiply by your panel's per-segment rate for the gym's monthly SMS cost. This
is both a real expense to disclose and the reason SMS credit resale is a
standing gross-profit line.

### Global suppression — applies to all six

| Rule | Value |
|---|---|
| Quiet hours | Send only 09:00–21:00 Asia/Tehran. Queue outside, flush at 09:00. |
| Frequency cap | Max **2 automated messages per person per 7 days**, any recipe. |
| Same-day collision | **One recipe per person per day.** Highest priority wins, others are marked `suppressed`, not queued. |
| Priority order | `arrears_reminder` > `expiry_1d` > `expiry_7d` > `lapsed_14d` > `first_week` > `birthday` |
| Official holidays | Suppress all except `birthday` and `arrears_reminder`. Uses the `holiday` table. |
| Opt-out | Honour per-person suppression flag. **Verify whether Iranian opt-out requirements (`لغو۱۱` convention) bind transactional gym messages — this is a legal question, not a product one.** |
| Frozen members | Never messaged by any recipe. |

Without the collision rule you will send one member three messages in a morning,
the gym will get the complaint, and they will turn the whole feature off.

### Proving it works — run a hold-out

For each gym's first 90 days, hold back a random **10%** of eligible members
from `expiry_7d` and `arrears_reminder`. Compare renewal rate and Rial collected
against the treated 90%.

This is how the sales number becomes credible rather than asserted: *"in your
first quarter, members we chased renewed at 61% against 44% for the ones we
didn't."* Turn the hold-out off after 90 days — keeping it costs the gym real
money.

---

## 1. `expiry_7d` — membership ending

| | |
|---|---|
| **Trigger** | `scheduledTrigger(kind='membership_expiring')`, materialised at `membership.endsAt − 7d` on write; superseded on any change to `endsAt` |
| **Condition** | `status='active'` · not frozen · no successor membership · person not opted out |
| **Idempotency** | `expiry7:{membershipId}` |
| **Priority** | 3 |

```
{firstName} عزیز، اشتراک شما در {gymName} ۷ روز دیگر به پایان می‌رسد.
برای تمدید به پذیرش مراجعه کنید.
```
≈ 96 chars → **2 segments**

**Config:** offset days (default 7), copy, enabled.
**Measured by:** renewal within 14 days of expiry vs. hold-out.

---

## 2. `expiry_1d` — last call

| | |
|---|---|
| **Trigger** | `scheduledTrigger` at `endsAt − 1d` |
| **Condition** | as above, **and** `expiry_7d` already fired without renewal |
| **Idempotency** | `expiry1:{membershipId}` |
| **Priority** | 2 |

```
{firstName} عزیز، اشتراک شما فردا تمام می‌شود. برای جلوگیری از قطع دسترسی،
امروز تمدید کنید. {gymName}
```
≈ 104 chars → **2 segments**

**Note:** do not send if the member has already renewed — check for a successor
membership at send time, not at schedule time. A renewal between scheduling and
firing is the most common case, and messaging a member who just paid is the
fastest way to lose the gym's trust in the feature.

---

## 3. `arrears_reminder` — the money recipe

The single highest-value automation in the MVP. Needs no payment rail.

| | |
|---|---|
| **Trigger** | Nightly job over `member_receivable` balances |
| **Condition** | balance > `arrears_min_rial` (default 500,000 R = 50,000 T) · aged > 7 days · membership active or expired < 30d |
| **Idempotency** | `arrears:{personId}:{jalaliYm}:{agingBucket}` — buckets `7d`/`21d`/`45d`, so at most 3 sends per member per Jalali month |
| **Priority** | 1 (highest) |

```
{firstName} عزیز، مانده بدهی شما {amountToman} تومان است.
لطفاً جهت تسویه به پذیرش مراجعه کنید. {gymName}
```
≈ 98 chars → **2 segments**

**Critical formatting:** render the amount in **Toman with Persian digits and
thousands separators** — `۴۲۰٬۰۰۰`. Sending a Rial figure will read as a
tenfold overcharge and generate angry phone calls at the front desk.

**Config:** minimum Rial threshold, aging buckets, copy, enabled.
**Measured by:** Rial collected within 7 days of send vs. hold-out. **This is
the number on the owner's dashboard and in your sales deck.**

---

## 4. `lapsed_14d` — quiet member

| | |
|---|---|
| **Trigger** | Nightly, from `riskScore` recompute |
| **Condition** | active membership · no check-in in 14 days · **personal baseline ≥ 4 visits/month** |
| **Idempotency** | `lapsed:{personId}:{jalaliYm}` — once per month, maximum |
| **Priority** | 4 |

```
{firstName} عزیز، جای شما در {gymName} خالی است.
منتظر دیدن دوباره شما هستیم.
```
≈ 74 chars → **2 segments**

**The baseline condition matters.** A member who always trained twice a month
and hasn't come in 14 days is behaving normally. Comparing against *their own*
history rather than a global threshold is what stops this recipe from spamming
casual members — and it's the honest version of "churn prediction" without any
model.

---

## 5. `birthday` — cheap goodwill

| | |
|---|---|
| **Trigger** | Nightly, Jalali date match on `person.birthDate` |
| **Condition** | active or lapsed < 90d · `birthDate` present |
| **Idempotency** | `bday:{personId}:{jalaliYear}` |
| **Priority** | 6 (lowest) |

```
{firstName} عزیز، تولدت مبارک! 🎉
{gymName}
```
≈ 42 chars → **1 segment**

Lowest business value, highest goodwill per Rial, and the one message members
screenshot. Ships because it's nearly free — one segment, ~50 sends a month.
Optionally attach a renewal discount code; leave that off by default.

---

## 6. `first_week` — onboarding rescue

| | |
|---|---|
| **Trigger** | `scheduledTrigger` at `membership.startsAt + 3d` |
| **Condition** | membership active · **exactly one check-in** since start |
| **Idempotency** | `firstweek:{membershipId}` |
| **Priority** | 5 |

```
{firstName} عزیز، خوش آمدید! برای برنامه تمرینی رایگان با مربی هماهنگ کنید.
{gymName}
```
≈ 88 chars → **2 segments**

Smallest volume, disproportionate effect: ~70% of SMB churn happens in the
first 90 days, and a member who never returns after visit one is the cheapest
possible save. Routes to a *human* action (talk to a trainer), which is what
actually works at this stage.

---

## 7. Implementation order

Build in this sequence — each is independently demoable:

1. **`message` + provider adapter + idempotency + quiet hours.** No recipes yet. Prove one SMS sends exactly once, and survives a worker retry.
2. **`arrears_reminder`.** The wedge. Needs only the ledger, which is MVP anyway. Demo this to gyms before anything else exists.
3. **`expiry_7d` + `expiry_1d`.** Needs `scheduledTrigger` materialisation.
4. **Suppression engine** — frequency cap, collision priority, holidays. *Ship this before enabling more than two recipes for any real gym.*
5. **`lapsed_14d`** — needs `riskScore` and per-member baselines.
6. **`first_week`, `birthday`** — trivial once the engine exists.
7. **Hold-out + attribution reporting.** Last, but before your first paid sale — it's what makes the pitch provable.

---

## 8. Open questions for the design-partner gyms

1. Do they currently chase arrears at all, and how? (Phone? In person? Not at all?) This tells you the baseline your hold-out measures against.
2. Would they accept GymOS messaging members in the gym's name automatically, or do they want to approve each batch? **If they want approval, the "automation" pitch weakens considerably** — find out early.
3. What sender line do they use now, and do they own it? Dedicated lines require a registered entity — which you don't have yet. **Confirm whether you can send on a shared line in the interim, or whether this blocks the wedge too.**
4. Is a discount code in the birthday message welcome, or does it cheapen the gesture?
