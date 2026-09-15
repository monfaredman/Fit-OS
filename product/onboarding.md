# GymOS — Gym Onboarding, Day 0–30

The 30-day trial converts **only if you have engineered a proof point by day 28.**
That proof point is a Toman figure. Everything below drives to it.

---

## Before day 0

| When | Action |
|---|---|
| Visit 1 | Ask the qualifying question. Ask for a data file. |
| −7 to −2 | Migrate their data. Time yourself. |
| −1 | **Demo with their own members and their own arrears total.** Not a generic demo, ever. |
| −1 | Agree the go-live date and confirm **you will be there in person.** |

Never go live remotely on the first gym. Non-negotiable.

---

## The timeline

| Day | What happens | Health check | If it stalls |
|---|---|---|---|
| **0** | On site. Desk live. Watch the receptionist admit 20 people. Fix friction there and then. | ≥ 20 check-ins | You're still there — fix it |
| **1–2** | On call. Answer within minutes, not hours. | Check-ins both days | Go back. In person |
| **3** | Confirm they've stopped using the old system for check-in | Check-ins ≥ 60% of expected | The receptionist is avoiding something. Call *her*, not the owner |
| **5** | **Activation** — 5 consecutive days of check-ins | ✅ Activated | Not activated by day 7 = at risk. Visit |
| **7** | Enable `arrears_reminder` with the 10% hold-out. Show the owner the arrears total. | Automation on | If they want to approve each batch, agree — don't argue |
| **10** | First payments arrive from chased members | ≥ 1 recovery | Check SMS delivery receipts first |
| **14** | **First recovery number exists.** Send it to the owner unprompted. | Recovered > 0 | Investigate: delivery? amounts? wrong members? |
| **14** | Enable `expiry_7d` + `expiry_1d` | | |
| **21** | Mid-trial call. Lead with the recovered figure. Enable remaining recipes. | Owner has opened the dashboard | If they've never opened it, they won't renew. Get in front of them |
| **28** | **Conversion conversation**, with the number | | See below |
| **30** | Trial ends | Paid | |

---

## The day-28 conversation

Do not ask whether they'd like to continue. Open with the number:

> «در این سی روز، ۳۸ میلیون تومان شهریه‌ی معوق وصول شد که قبلاً پیگیری نمی‌شد.
> اعضایی که سیستم پیگیری کرد ۶۱ درصد تمدید کردند، آن ۱۰ درصدی که پیگیری نشدند ۴۴ درصد.»

Then the price. In that order, never reversed.

**This is why the hold-out exists.** Without it you have an assertion; with it
you have their own gym's evidence. Turn the hold-out off at day 90 — after that
it's costing them real money.

---

## Who you actually onboard

**The receptionist, not the owner.** The owner signs; the receptionist decides
whether the product survives month two. Practically:

- Learn her name at visit 1 and use it
- Train her, not the owner
- Give her your direct number
- When something breaks, apologise to her first
- At day 21, ask *her* what's annoying. Fix the top item before day 28

A gym where the receptionist likes the software renews. A gym where she tolerates
it churns in month three, whatever the owner said.

---

## Failure signals, in order of severity

| Signal | Meaning |
|---|---|
| Check-ins stop for 2+ days | **Critical.** They've reverted to the old system. Go there today |
| Receptionist stops answering your calls | **Critical.** Something broke and she's working around it |
| Owner never opens the dashboard | Won't renew. No value perceived |
| Arrears total never drops | The wedge isn't working *for this gym* — find out why before day 28 |
| Automation disabled by the gym | Ask immediately. Usually a member complained about message frequency — check the suppression rules |
| "Can you add…" in week 1 | Healthy. They're engaged. Log it, don't build it (`scope-freeze.md`) |

---

## Design partners are different

First three gyms: free for 6 months, in writing, in exchange for weekly access
and a reference.

That is **not a discount** — it's a different agreement. Keep the categories
clean or you'll never learn what anyone will actually pay. They still go through
this timeline; the day-28 conversation becomes a reference request instead of a
price.

---

## What onboarding costs you

| Item | Estimate |
|---|---|
| Migration | 4–8 h |
| Go-live on site | 4–6 h |
| Days 1–7 support | 3–5 h |
| Days 8–30 | 2–4 h |
| **Total** | **13–23 h per gym** |

At a target CAC of 18M Toman, onboarding labour is most of it. This is why the
free tier is dead, why Segment A is deferred, and why the migration tooling has
to get faster with every gym — **it is the only line item you can compress.**
