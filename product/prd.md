# GymOS — Product Requirements

**Status:** MVP definition · Solo build · Pre-entity
**Derived from:** `../gymos-iran-teardown.html`

---

## 1. Problem

Iranian gyms lose money they have already earned.

Every Iranian gym management product ships the same feature: *block entry for
members with overdue tuition*. Parsian, My-Gym, Smart Kerman, Zaman Pardaz,
Antus — all of them. That is not a feature, it is a symptom. Unpaid dues
(`بدهی`) are endemic, gyms run on cash and card-to-card transfers, and the owner
personally chases money every month.

Nobody solves it. The incumbents record the debt and refuse the door. They don't
chase, don't quantify, don't recover.

**Most owners cannot tell you how much of last month's tuition is uncollected.**
For a 600-member gym at ~2.5M Toman average tuition, a 15% shortfall is ~225M
Toman of exposure — every month, invisible.

## 2. Solution

Gym management software whose defining capability is **knowing exactly who owes
what, and chasing them automatically.**

Everything else — attendance, lockers, buffet, memberships — is the context that
makes the money legitimate and the product credible. It is table stakes, built
to parity, not to differentiate.

> **«ما به شما می‌گوییم چه کسی چقدر بدهکار است، و خودمان پیگیری می‌کنیم.»**

## 3. Who it's for

**Buyer:** owner of a 300–1,500 member gym in Tehran or Karaj. Single site or
two. Employs a receptionist. Currently pays for desktop software they tolerate.
Checks the gym's numbers by phoning the receptionist.

**Qualifying signal:** they know roughly how much tuition is uncollected, and the
number makes them wince.

**Primary user:** the **receptionist**. ~100 interactions a day. If the product
is slower than what they have, the gym churns in month two regardless of what
the owner thinks.

**Secondary user:** the **owner**, on a phone, at night, for 90 seconds.

**Tertiary:** the **member**, only where it enables collection.

**Explicitly not for (yet):** gyms under 250 members, gyms without a
receptionist, non-gym sports verticals, anyone outside the top cities.

## 4. Jobs to be done

**Receptionist**
- Admit a member in under two seconds during peak hour, without a mouse
- Register a new member with them standing at the desk, in under 90 seconds
- Take a partial payment without it being an error state
- Sell a bottle of water without opening another application
- Close the drawer at end of shift and prove it balanced

**Owner**
- See revenue, attendance and outstanding debt without phoning the gym
- Know who is about to leave, before they leave
- Know money is being collected without doing the chasing
- Trust that the front desk works when the internet doesn't

**Member**
- Know when their membership ends and how many sessions remain
- See what they owe and settle it
- Get in the door without installing anything

## 5. Success metrics

**North star: Toman recovered per gym per month.**

The value delivered, the reason they renew, and the sentence that closes the next
sale. Measured against a 10% hold-out for each gym's first 90 days
(`../design/automation-recipes.md` §0) — otherwise it's a claim, not a number.

| Metric | MVP target | Why |
|---|---|---|
| Toman recovered / gym / month | ≥ 10× subscription price | The ROI argument. Below 5× the pitch fails |
| Activation rate | ≥ 80% of migrated gyms | See §6 |
| Check-in p95 latency | **< 2 s** ← counter-metric | Guards against shipping features that slow the desk |
| Trial → paid | ≥ 50% | Below this, either ICP or onboarding is wrong |
| Monthly logo churn | < 3% | Base case in the financial model |
| Migration wall-clock | < 48 h | The GTM promise |
| Receptionist daily active | 100% of live gyms | If the receptionist stops using it, the gym is already churned |

## 6. Activation — the definition that matters

A gym is **activated** when all three are true:

1. Migration complete and verified by the receptionist
2. Five consecutive days of check-ins recorded
3. At least one automation enabled

Everything in onboarding drives to this. A gym that migrates but never reaches
day-5 check-ins has not adopted the product, and will not convert at day 30.

## 7. Scope — MVP

**In:**
- Members and leads, one lifecycle
- Plans: duration, session-count, hybrid · freeze · renewal
- Tuition, arrears ledger, partial payment, member wallet
- Check-in: QR, card, manual — **offline tolerant**
- Lockers: public auto-assign, VIP contracts
- Buffet POS on the wallet
- SMS engine with idempotency, quiet hours, credit accounting
- Automation engine + 6 recipes
- Retention Intelligence, rules-based, with stated reasons
- Owner mobile dashboard
- Trainer commission settlement
- Solar Hijri throughout
- Migration: Excel/CSV + one incumbent format
- Cash drawer close with variance

**Out of MVP, in V1:** direct debit, member PWA, lead desk, booking, workout and
nutrition programs, body measurements, read-only AI copilot, multi-branch.

**Out of V1, in V2:** hardware write-back, write-capable agent, corporate
accounts, e-invoicing, visual workflow builder, API.

## 8. Non-goals — decided, not deferred

| Not building | Why |
|---|---|
| Website builder | Iranian gyms market on Instagram |
| Review / reputation management | Google reviews aren't a factor here |
| Dynamic pricing | Tuition sits against published union rate cards — legal exposure |
| Double-entry accounting | Mature defended category. Export instead |
| Statutory payroll | Compliance liability. Trainer commission only |
| Marketplace / sports network | Needs density that won't exist |
| Native branded mobile app | PWA. Revisit only for a chain that pays |
| ML churn prediction | No training data for 12+ months. Rules are ~95% as good |
| MCP / ChatGPT connector | Built for Western AI-mediated discovery. Zero transfer |
| Multi-vertical configurability | Schema supports it. Do not productize it |

## 9. Constraints

- **Offline-tolerant front desk is a hard requirement**, not a feature
- **SMS is the only reliable channel.** Telegram filtered, Instagram filtered, WhatsApp politically unstable
- **In-country hosting**, mandatory
- **Persian SMS = 70 chars/segment.** Budget two segments per message
- **No legal entity yet** — blocks direct debit and possibly dedicated SMS lines
- **One developer.** Every scope decision is measured against that

## 10. Open risks

| Risk | Status |
|---|---|
| Direct debit unobtainable for this entity type | Week-1 PSP call |
| Shared family phone numbers break member identity | Week-1 gym visits — **the only open question that can still change the schema** |
| Dedicated SMS line requires an entity | Week-1 provider call |
| Controller protocols sealed | Post-MVP; read-only fallback exists |
| Gyms want to approve each message batch rather than automate | Week-1 gym visits — would weaken the pitch, not the build |
