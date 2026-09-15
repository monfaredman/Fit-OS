# GymOS — The 48-Hour Switch Service

Your main GTM weapon, and a sales asset before it's a product feature (see
`sales-kit.md` §1 — you migrate *before* you demo).

---

## 1. The scoping decision that makes this tractable

**Do not migrate everything.** The instinct is to move all history; it is wrong,
and it is what turns a two-day job into a two-week one.

| Migrate | Why |
|---|---|
| **People** — name, mobile, gender, birth date, member no, photo if available | Required |
| **Active + recently expired memberships** (last 90 days) | Required — this is what the desk needs tomorrow |
| **Current outstanding balance per member** | Required — this is the arrears wedge. A single opening-balance figure, not a payment history |
| **Attendance, last 90 days only** | Enough to compute personal baselines for `lapsed_14d` |
| **Plans / tariffs** | Required — usually ~5–20 rows, often faster to retype |

| Skip | Tell the customer |
|---|---|
| Full payment history | *«نرم‌افزار قبلی‌تان پاک نمی‌شود — سابقه همیشه در دسترس است.»* |
| Attendance older than 90 days | Same |
| Body measurements, workout programs | Offer as a paid later import if anyone ever asks. Nobody will. |

Opening balances enter the ledger as **one** `ledger_transaction(type='opening_balance')`
per member: debit `member_receivable`, credit a dedicated `opening_balance`
account. Clean, auditable, and it means you never have to reconstruct how the
debt arose.

---

## 2. Four extraction tiers — try in order

**Tier 0 — the app's own export.** Most Iranian gym software has Excel export on
its member and debtor reports. Start here every time; it often ends here.
Cost: 10 minutes.

**Tier 1 — Access files** (`.mdb` / `.accdb`). Common for older desktop apps.
On Windows via ODBC, or `mdbtools` (`mdb-tables`, `mdb-export`) on Linux/macOS.
Cost: an hour once you've seen the schema.

**Tier 2 — SQL Server backups** (`.bak` / `.mdf`). Restore into a throwaway
SQL Server in Docker, then query. Cost: half a day the first time, minutes after.

**Tier 3 — manual.** Screenshots, printed reports, typing. Absorb the cost; do
not charge for it. A gym worth having is worth a day of data entry.

**Unknown until the visits:** which tier each incumbent needs. `gym-visit-script.md`
asks for a data file precisely so you can find out before promising 48 hours.

---

## 3. Pipeline

```
file → probe → extract → normalise → match → preview → approve → commit
```

- **probe** — identify source and version from table names. Store a fingerprint so the second gym on the same software is instant.
- **extract** — dump raw rows into `import_row.raw` untouched. Never transform during extraction; you will want the original when something looks wrong.
- **normalise** — the real work, see §4.
- **match** — dedupe within the batch and against any existing people.
- **preview** — counts, sample rows, every rejection with a reason. The customer approves this screen.
- **commit** — one transaction per batch. Rollback must be a single statement.

`import_batch.mapping` stores the column map. Build a map once per source and
reuse it — this is the compounding asset named as a moat in the strategy report.

---

## 4. Normalisation — where the bugs live

**Mobile numbers.** The highest-value field and the dirtiest. Normalise to
`9XXXXXXXXX`:
- Strip spaces, dashes, parentheses
- Convert Persian/Arabic-Indic digits (`۰۹۱۲` → `0912`)
- Strip `+98`, `0098`, leading `0`
- Reject anything that isn't 10 digits starting `9`

**Money.** Incumbent data may be Toman *or* Rial and will not say which. Heuristic:
if the median membership price is under 100,000 the file is in Toman; multiply by
10. **Always show the median in the preview and make the customer confirm the
unit.** Getting this wrong by 10× destroys trust on day one.

**Dates.** Stored as Jalali strings (`1404/06/22`), Gregorian dates, or Excel
serials. Detect per column, don't assume. Two-digit Jalali years (`04/06/22`) are
common — infer the century from surrounding data.

**Names.** Trim, collapse whitespace, normalise Arabic `ي`/`ك` to Persian `ی`/`ک`,
and normalise ZWNJ. Without this, search fails on names the receptionist typed
slightly differently and they conclude the product is broken.

---

## 5. Duplicate policy

| Case | Action |
|---|---|
| Same normalised mobile within batch | Merge, keep most recent membership, flag in preview |
| Same mobile as existing person | Link, don't create. Add the membership to the existing person |
| Same name, no mobile | **Do not auto-merge.** Import both, flag as possible duplicates for staff review |
| No mobile at all | Import with a placeholder, flag. Common for old records |

Auto-merging on name alone will silently combine two real members. Never do it.

---

## 6. The 48-hour clock

| Hour | Step |
|---|---|
| 0 | File received |
| 0–4 | Probe, extract, first normalisation pass |
| 4–8 | Mapping fixes, rejection triage |
| 8–24 | Preview sent; customer reviews |
| 24–36 | Corrections |
| 36–48 | Commit, verify counts with the receptionist, go live |

**Start the clock when you have the file, not when they sign.** And verify with
the *receptionist*, not the owner — they're the one who'll spot that 30 members
are missing.

---

## 7. Verification before you say "done"

- Member count matches their own report ±0
- Total outstanding arrears matches their figure, or the difference is explained
- Ten random members spot-checked by the receptionist against the old system
- Every active member appears in `access_snapshot` with a correct `can_enter`
- Their top 5 tariffs exist with correct prices
- **Old system left installed and running.** Never uninstall it. The fallback is the reason they feel safe switching.
