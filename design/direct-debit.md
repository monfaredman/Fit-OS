# GymOS — Direct Debit (پرداخت مستقیم)

The wedge. **Blocked on two answers**, both in week 1:

1. Does Zarinpal enable direct debit for a **شخص حقیقی**, or is **شخصیت حقوقی** required?
2. If حقوقی — which entity type? *File that type, not a guess.*

Write no code until answer 1 is in hand.

---

## 1. The economics — published, and better than expected

Zarinpal's stated fee: **10,000 Rial fixed + 1%, the percentage capped at
60,000 Rial** per successful transaction
([source](https://www.zarinpal.com/landing/direct-debit/)).

Gym tuition is 10–40M Rial, so the 1% hits the cap on every single collection:

| Tuition | 1% | Capped at | Fee | As % |
|---:|---:|---:|---:|---:|
| 600,000 T | 60,000 R | 60,000 R | **70,000 R ≈ 7,000 T** | 1.17% |
| 2,500,000 T | 250,000 R | 60,000 R | **70,000 R ≈ 7,000 T** | 0.28% |
| 6,000,000 T | 600,000 R | 60,000 R | **70,000 R ≈ 7,000 T** | 0.12% |

**Effectively a flat ~7,000 Toman per collection.** Confirm the exact structure
on the call — I'm reading the Persian as *fixed + capped percentage*, and if the
cap applies to the total instead, the math changes.

---

## 2. Who pays — and the option you should actually pick

| Model | Verdict |
|---|---|
| Gym pays, passed through at cost | ✅ Correct. Transparent, honest, a separate line on their invoice |
| Gym pays, you add a margin | ❌ Visible and resented. Pursue an aggregator rate and keep the spread instead — ask about this on the call |
| Member pays | ❌ Turns your retention feature into a reason to cancel |
| **You absorb it in the subscription** | ❌ **Mathematically fatal.** 600 collections × 7,000 T = 4.2M T/month against a 3.4M T subscription. Negative gross margin. |

### Collect selectively, not universally

Don't replace the front desk. A 600-member gym auto-collecting everything pays
4.2M Toman/month in fees — more than its subscription, and the owner will do
that arithmetic in front of you.

**Enrol only where the fee replaces a loss:**

- Members who **opt in** for convenience
- Members **chronically late** (2+ arrears cycles) — offered as the alternative to being chased
- Members on **annual or multi-month** plans

A member who pays cash on time at the desk costs nothing and needs no mandate.
This cuts the gym's monthly fee by roughly three-quarters while keeping nearly
all the recovery value — and it makes the pitch *«فقط برای کسانی که دیر پرداخت
می‌کنند»*, which is far easier to sell than a blanket change to how everyone pays.

---

## 3. Mandate capture

```
member PWA → "فعال‌سازی پرداخت خودکار" → Zarinpal → bank auth
          → callback_url → mandate.status='active'
```

- Create `mandate` as `pending` **before** redirecting. Never rely on the callback alone to create the row.
- Callback is not guaranteed to arrive — poll mandate status as a backstop.
- Set `maxAmountRial` ~20% above the member's current tuition, not unlimited. Members will ask what the ceiling is, and "unlimited" loses the mandate.
- Store `expiresAt` and schedule re-authorisation before it lapses.

### The cancellation endpoint is mandatory

Zarinpal's documentation requires the merchant to give users a way to cancel
their own mandate. This is not optional and not a nice-to-have:

- A visible **«لغو پرداخت خودکار»** control in the member PWA
- Sets `mandate.revokedAt`, cancels queued `collectionAttempt` rows
- Notifies the gym so staff aren't surprised when collection stops

Build this in the same sprint as capture. Shipping capture without cancellation
risks your PSP relationship — the thing you waited months for.

---

## 4. Collection runs

**Schedule for the first week of the Jalali month.** Iranian salaries largely
land at month end or in the first days of the new month; collecting mid-month
against an empty account manufactures failures you then pay to retry.

Daily worker:

1. Select `collectionAttempt` where `status='queued'` and `scheduledFor <= now()`
2. For each: verify the mandate is still `active`, verify the debt still exists — **a member may have paid cash at the desk this morning**
3. Call the PSP with `idempotencyKey` (format: `coll:{membershipId}:{jalaliYm}:{attemptNo}`)
4. On success: write the `payment` row and the balanced `ledgerTransaction` — **identical shape to a cash payment, with `bank` instead of `cash_drawer`**
5. On failure: record `failureCode`, insert the next attempt row

Step 2 is the one that generates angry phone calls if skipped.

### Retry policy

| Attempt | When | On final failure |
|---|---|---|
| 1 | Scheduled date | — |
| 2 | +3 days | — |
| 3 | +7 days | Abandon; hand off to `arrears_reminder` SMS and flag for the desk |

Three attempts maximum. Each costs nothing if it fails, but repeated bank
declines annoy the member and the gym.

---

## 5. Reconciliation — build this before launch, not after

Pull the PSP settlement report daily and compare against `collectionAttempt`:

| Discrepancy | Meaning |
|---|---|
| Settled at PSP, no local success | Callback lost. Reconcile forward, post the payment |
| Local success, not in settlement | Serious. Alert immediately, do not post |
| Amount mismatch | Alert, never auto-correct |
| Fee differs from expected | Your fee model is wrong — revisit pricing |

Post PSP fees as their own `ledgerTransaction(type='psp_fee')` so the gym can see
exactly what collection cost them. Hiding the fee is how you lose trust on the
feature that earns it.

---

## 6. Build order

1. **PSP call.** Eligibility, entity type, document list, fee confirmation, aggregator rates.
2. Entity registration of the confirmed type.
3. Sandbox integration: capture one mandate, collect once, cancel once.
4. Mandate capture in the member PWA + the cancellation control.
5. Collection worker + retries.
6. Reconciliation + fee posting.
7. Enrolment targeting — opt-in and chronic-late flows per §2.

Until step 1 returns, `arrears_reminder` SMS is the whole wedge, and it is
enough to sell on.
