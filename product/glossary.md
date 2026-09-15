# GymOS — Glossary & Naming

Persian in the UI, English in the code. Both have to be **consistent**, or the
product feels amateur to staff and the codebase drifts.

Two rules:
1. **One Persian word per concept, everywhere.** A gym that sees `ورزشکار` on one
   screen and `عضو` on the next concludes the software is unfinished.
2. **Code never contains Persian identifiers.** Persian lives only in translation
   files.

---

## Canonical terms

| Concept | **Use this** | Never mix with | Code |
|---|---|---|---|
| Person record | **عضو** | ورزشکار, مشتری | `person` |
| Prospective member | **سرنخ** | مشتری بالقوه | `person.stage='lead'` |
| Purchased membership | **اشتراک** | عضویت | `membership` |
| Price list entry | **تعرفه** | پلن, طرح | `plan` |
| Money owed for training | **شهریه** | حق عضویت | `tuition` |
| Outstanding balance | **بدهی** | معوقات* | `arrears` |
| Single training visit | **جلسه** | — | `session` |
| Suspended membership | **تعلیق** | فریز† | `freeze` |
| Entry/exit records | **تردد** | حضور و غیاب‡ | `checkIn` |
| The act of admitting | **ثبت ورود** | — | `checkIn` |
| Front desk | **پذیرش** | — | `desk` |
| Coach | **مربی** | — | `trainer` |
| Employees | **کارکنان** | پرسنل | `staff` |
| Storage locker | **کمد** | — | `locker` |
| Snack shop | **بوفه** | کافه | `posSale` |
| Prepaid member credit | **کیف پول** | اعتبار | `wallet` |
| Till / cash box | **صندوق** | — | `cashDrawer` |
| Site | **شعبه** | مجموعه | `location` |
| Extending a membership | **تمدید** | — | `renewal` |
| End date | **انقضا** | پایان اشتراک | `expiry` |
| Price reduction | **تخفیف** | — | `discount` |
| Proof of payment | **رسید** | — | `receipt` |
| Tax document | **فاکتور** | صورتحساب | `invoice` |
| **Trainer's cut** | **پورسانت** | کارمزد | `commission` |
| **PSP transaction fee** | **کارمزد** | پورسانت | `pspFee` |
| Standing collection authority | **پرداخت خودکار** | پرداخت مستقیم§ | `mandate` |
| Automated follow-up | **پیگیری خودکار** | اتوماسیون | `automation` |
| Member likely to quit | **در معرض ترک باشگاه** | ریزش¶ | `riskScore` |

**\*** `معوقات` only for *aged* debt in reports. Day-to-day is `بدهی`.
**†** Staff say "فریز" out loud. Use `تعلیق` in the UI, but make search match both.
**‡** `حضور و غیاب` is school/office vocabulary. Gyms say `تردد`.
**§** `پرداخت مستقیم` is Zarinpal's product name — use it in contracts and with
the PSP. Members see `پرداخت خودکار`, which is friendlier and clearer.
**¶** `ریزش` is your internal word. Never show it to a gym owner about a named
member — it reads as writing someone off.

---

## Formatting conventions

| Rule | Example |
|---|---|
| Currency displayed in Toman, stored in Rial | `۲٬۵۰۰٬۰۰۰ تومان` ← `25000000` |
| Persian digits with `٬` separators in display | `۴۲۰٬۰۰۰` |
| **Accept Persian and Latin digits on input** | `۱۵۰۰۰۰۰` and `1500000` both valid |
| Amounts render LTR inside RTL layout | never mirror a number |
| All dates Jalali in staff and member UI | `۱۴۰۵/۰۷/۰۵` |
| Week starts Saturday | `شنبه` is column 1 |
| Mobile normalised to `9XXXXXXXXX` | display as `۰۹۱۲۳۴۵۶۷۸۹` |
| Never show a Rial figure to a member | reads as a 10× overcharge |
| Never show a Gregorian date to anyone | |

Normalise `ي`→`ی` and `ك`→`ک` on every text input and before every search. Arabic
codepoints arrive from imports, older keyboards and copy-paste, and silently
break name lookup — which staff experience as "the software can't find people."

---

## Message tone

- Address members by first name with `عزیز` — «علی عزیز،»
- Use `شما`, never `تو`
- Sign every SMS with the **gym's** name, never GymOS. You are infrastructure
- Debt messages state the amount and the action, with no apology and no pressure
- Never the word «بدهکار» addressed to a member. Say «مانده بدهی شما»
