# GymOS — Receptionist Flow

The receptionist touches this system ~100 times a day. The owner touches it
once. **Every design decision below favours the hundred.**

If check-in is slower than the Windows app they're replacing, the gym churns in
month two regardless of what else the product does.

---

## 1. Performance budget — treat these as acceptance criteria

| Action | Budget | Why |
|---|---|---|
| Search → member found | **< 400 ms** | They type while the member is still walking over |
| Check-in, start to confirmed | **< 2 s, zero mouse** | Peak hour is 40 people in 20 minutes |
| New member registration | **< 90 s** | Done at the desk with the member standing there |
| Take payment | **< 15 s** | |
| Buffet sale | **< 10 s** | Queue forms behind it |
| Any screen, first paint | **< 1 s** | On the gym's actual PC, which is old |

Test on a 5-year-old Windows machine over a throttled connection. Not your Mac.

---

## 2. The Desk — the only screen that's ever open

One screen, always focused, never navigated away from. Everything else opens
over it and returns.

```
┌─────────────────────────────────────────────────────────────┐
│  ● آنلاین        شعبه مرکزی        ۱۴۰۵/۰۶/۲۲        [خروج] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌───────────────────────────────────────────────────┐     │
│   │  جستجو: نام، موبایل، شماره عضویت...          [⌕]  │     │  ← always focused
│   └───────────────────────────────────────────────────┘     │
│                                                             │
├──────────────────────────────┬──────────────────────────────┤
│  ورودهای امروز        ۸۳     │  در انتظار                   │
│                              │                              │
│  ۱۸:۰۴  مریم احمدی      ✓   │  ۳ نفر بدهکار امروز آمدند    │
│  ۱۸:۰۲  رضا کریمی       ✓   │  ۷ اشتراک این هفته تمام می‌شود│
│  ۱۷:۵۸  سارا نوری       ⚠   │  ۲ کمد VIP امروز تمام می‌شود  │
│  ۱۷:۵۱  علی رضایی       ✓   │                              │
│                              │  [بستن صندوق]                │
└──────────────────────────────┴──────────────────────────────┘
```

**Rules:**
- The search box holds focus. Any keystroke anywhere types into it. `Esc` clears it.
- A QR/barcode scanner is just a keyboard — scanning fills the box and submits. No scanner-specific mode.
- **No modal ever blocks the search box.** If a dialog is open and someone scans, the scan wins and the dialog dismisses.
- Connection state is permanently visible. `● آنلاین` green / `◐ آفلاین — ۱۲ ورود در صف` amber. Never hide this.

---

## 3. The member card — one glance decides everything

Appears inline the moment search resolves. Not a page navigation.

```
┌─────────────────────────────────────────────────────────────┐
│  ┌────┐  علی رضایی                    ●  فعال               │
│  │ 📷 │  ۰۹۱۲۳۴۵۶۷۸۹  ·  عضو ۱۴۰۲                          │
│  └────┘                                                     │
│                                                             │
│   اشتراک        بدنسازی — ۱۲ جلسه       ۵ جلسه باقی‌مانده   │
│   انقضا         ۱۴۰۵/۰۷/۰۵              ۱۳ روز              │
│   بدهی          ۴۲۰٬۰۰۰ تومان           ۲۳ روز              │
│   کمد           A-۱۴ (عمومی)                                │
│                                                             │
│  [ ثبت ورود ]  [ دریافت وجه ]  [ فروش بوفه ]  [ کمد ]  [⋯] │
└─────────────────────────────────────────────────────────────┘
```

Four facts, always in the same four positions: **subscription, expiry, debt,
locker.** The receptionist learns the positions and stops reading labels within
a week. Never reorder them, never hide a row when empty — show `—`.

**State encoded in form, not only colour:** `● فعال` / `◑ منجمد` / `⚠ بدهکار` /
`✕ منقضی`. Colour-blind staff exist and gym lighting is bad.

`Enter` on a resolved card = check in. That is the 95% action.

---

## 4. Check-in — the 2-second path

1. Type last 4 digits of mobile, or scan.
2. Card resolves. `accessSnapshot` already decided — no server round-trip.
3. `Enter`.
4. Result banner, 1.5 s auto-dismiss:

| Outcome | Banner |
|---|---|
| Admitted | `✓ علی رضایی — خوش آمدید · ۴ جلسه باقی` green |
| Admitted, owes money | `✓ وارد شد — بدهی ۴۲۰٬۰۰۰ تومان` amber + `[دریافت وجه]` |
| Refused, expired | `✕ اشتراک منقضی شده — ۱۴۰۵/۰۶/۱۵` red + `[تمدید]` |
| Refused, no sessions | `✕ جلسات تمام شده` red + `[تمدید]` |
| Refused, wrong hours | `✕ ساعت مخصوص بانوان` red + `[ورود دستی]` |

**Manual override is always available** and always recorded as
`method='manual'` with the staff id. Do not make staff fight the software — they
will find a way around it, and you'll lose the audit trail entirely.

**Offline:** identical behaviour, plus the amber queue counter. The receptionist
should not be able to tell the difference. That's the whole point.

---

## 5. New member — 90 seconds, one screen, no wizard

Required: **first name, last name, mobile.** Everything else optional and below
the fold. A wizard with four steps guarantees half-finished records.

```
نام [__________]  نام خانوادگی [__________]  موبایل [__________]

تعرفه  [ بدنسازی — ۱۲ جلسه  ▾ ]     ۲٬۵۰۰٬۰۰۰ تومان
تخفیف  [ ۰ ]                        قابل پرداخت: ۲٬۵۰۰٬۰۰۰

دریافت  ( ) نقد  ( ) کارت  ( ) انتقال  ( ) بعداً
مبلغ    [ ۱٬۵۰۰٬۰۰۰ ]               باقی‌مانده: ۱٬۰۰۰٬۰۰۰ → بدهی

[ ثبت و ثبت ورود ]     [ ثبت ]
```

`ثبت و ثبت ورود` is the primary button — new members almost always train
immediately. Saving and then searching for the person you just created is the
kind of friction that makes staff hate software.

**Partial payment is a first-class path, not an error.** "بعداً" (later) is a
legitimate choice; it just creates the receivable. Fighting this loses you the
Iranian market.

---

## 6. Number and date input — the thing that will bite you

Non-negotiable, and easy to get wrong:

- **Accept Persian *and* Latin digits in every numeric field.** Staff switch keyboards constantly. `۱۵۰۰۰۰۰` and `1500000` must both work. Normalise on input.
- **Display Persian digits with thousands separators**: `۱٬۵۰۰٬۰۰۰`.
- **Display Toman. Store Rial.** Convert at the form boundary, once, in one helper. A Rial figure shown to a member reads as a tenfold overcharge.
- **Amount fields are LTR inside the RTL layout.** A number rendered right-to-left is a bug users can't articulate but will distrust.
- **Dates are Jalali on input and display**, with a Jalali picker. Never show a Gregorian date anywhere in the staff UI.
- **`Tab` order follows visual order in RTL.** Test it; frameworks get this wrong.

---

## 7. Buffet POS

Product grid, tap to add, one charge action. No cart page.

Payment priority: **wallet first** if the member has balance, then cash, then
card. Wallet is why the buffet exists — it's prepaid revenue.

If a walk-in has no member record, `شخص متفرقه` with cash only. Do not force
registration for a bottle of water.

---

## 8. Drawer close — end of shift, 60 seconds

```
شیفت: ۱۴:۰۰ – ۲۲:۰۰   ·   کاربر: زهرا م.

نقد ثبت‌شده در سیستم          ۱۲٬۴۵۰٬۰۰۰
موجودی شمرده‌شده     [ ____________ ]
                     ─────────────────
اختلاف                            —

[ بستن صندوق ]
```

Counted cash is entered by the receptionist, variance is computed, and the
result is visible to the owner. This is the fraud control from
`permissions.md` §2 — and it only works if closing is fast enough that they
actually do it every shift.

Frame it to the customer as *"صندوق هر شب درست بسته می‌شود"* — never as
anti-theft tooling.

---

## 9. Owner screens are a different product

The owner uses a phone, at night, for 90 seconds. Separate surface, not a
responsive squeeze of the desk UI.

Five tiles, in this order:

1. **درآمد امروز / این ماه** — with last month beside it
2. **بدهی معوق** — total outstanding, aged, and *recovered this month* ← the number that renews your subscription
3. **ورودهای امروز** — vs. the same weekday average
4. **اشتراک‌های در حال انقضا** — next 7 days
5. **اختلاف صندوق** — any shift variance this week, or `✓`

Tile 2 is the product. Everything else is context.

---

## 10. Build order

1. The Desk + search + member card (read-only)
2. Check-in, online only
3. New member + payment
4. Offline queue + snapshot cache ← *do this before any real gym uses it*
5. Buffet POS + wallet
6. Lockers
7. Drawer close
8. Owner mobile tiles
