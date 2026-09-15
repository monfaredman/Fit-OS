# GymOS — Member Surface

**V1, not MVP.** Pulled forward only because direct-debit mandate capture needs
somewhere to live.

---

## 1. The constraint that shapes everything

**Not every Iranian gym member has a smartphone**, and of those who do, many will
never open a gym's web page. The member surface is an accelerant, never a
dependency.

Every flow here has a desk equivalent that a receptionist can complete on the
member's behalf. If a feature only works when the member participates, it is
wrong.

*Corollary: never quote an adoption target to a gym owner. Promise nothing about
member uptake.*

---

## 2. Delivery: PWA, no install

No app store, no Cafe Bazaar, no download. The member opens a link, optionally
adds it to their home screen.

Why: store distribution is impaired, a native app is two more codebases you can't
maintain solo, and an install step will kill adoption in a population that
already doesn't want another app.

**Auth: mobile number + OTP by SMS.** No password. The mobile number is already
the identity key in `person`, and members will not remember a password for their
gym.

Session lasts 90 days. Re-authenticating a member every visit defeats the point.

---

## 3. Screens

### Home — one card, everything visible

```
┌───────────────────────────────────┐
│  علی رضایی                        │
│  باشگاه آتلانتیک                  │
├───────────────────────────────────┤
│  اشتراک      بدنسازی — ۱۲ جلسه    │
│  باقی‌مانده   ۵ جلسه               │
│  انقضا       ۱۴۰۵/۰۷/۰۵ (۱۳ روز)  │
│  بدهی        ۴۲۰٬۰۰۰ تومان        │
├───────────────────────────────────┤
│     [ پرداخت ]    [ تمدید ]       │
│     [ نمایش کد ورود ]             │
└───────────────────────────────────┘
```

Same four facts, same order, as the receptionist's member card. One vocabulary
across every surface.

### Entry code
A rotating QR the desk can scan. **Or** — preferable, and how Gymona does it —
the gym displays a static QR at the door which the member scans with any phone
camera; it opens this page and confirms entry. No scanner hardware, no app.

Ship the gym-displays-QR variant first. It costs the gym nothing.

### Attendance
Jalali month calendar, days attended marked. Read-only. Members like seeing
streaks, and it costs nothing to render.

### Dues & receipts
Outstanding balance with its age. Payment history. Every receipt downloadable.
Amounts in Toman, Persian digits, always.

### Automatic payment — the reason this surface exists
```
┌───────────────────────────────────┐
│  پرداخت خودکار                    │
│                                   │
│  شهریه هر ماه به‌صورت خودکار از    │
│  حساب شما پرداخت می‌شود.           │
│                                   │
│  سقف برداشت  ۳٬۰۰۰٬۰۰۰ تومان      │
│  وضعیت       فعال                 │
│                                   │
│  [ لغو پرداخت خودکار ]            │
└───────────────────────────────────┘
```

**The cancel control is mandatory**, per Zarinpal's merchant requirements
(`../design/direct-debit.md` §3). Build it in the same sprint as capture, not
after. Shipping capture without cancellation risks the PSP relationship you
waited months to obtain.

Show the withdrawal ceiling prominently. "Unlimited" loses the mandate — members
ask what the limit is, and the honest answer converts better.

### Program
Workout and nutrition plan, if the trainer assigned one. Read-only.
Consider partnering with IranBadan or Gymina rather than building this properly.

---

## 4. Explicitly out

| Not building | Why |
|---|---|
| Class booking | V1 at the earliest; open-floor market |
| Chat with trainer | Support surface you can't staff solo |
| Social feed, leaderboards | Not why anyone opens this |
| Wearable sync | No |
| Buying memberships online | V2 — needs the gateway, and the desk sells better anyway |
| Push notifications | SMS is the channel. Web push is unreliable here |

---

## 5. Privacy

- A member sees only their own data. Ever.
- Gym branding, not GymOS branding. You are infrastructure.
- Members can export their own record — the same one-click export principle as gyms.
- No member PII in logs.

---

## 6. Build order

1. Auth (mobile + OTP)
2. Home card
3. Dues & receipts
4. **Mandate capture + cancellation** ← the actual reason for this surface
5. Entry QR
6. Attendance calendar
7. Program view
