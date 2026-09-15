# GymOS — Permission Matrix

**Design principle: the receptionist is the primary user.** They touch the
system a hundred times a day; the owner touches it once. Every screen is
designed for the receptionist first, and the permission model reflects that —
they get broad *operational* power and near-zero *financial* power.

Roles: `owner` · `manager` · `receptionist` · `trainer` · `accountant`
(`member` is portal-only, V1.)

---

## 1. Matrix

Legend: **●** full · **◐** own/scoped only · **○** read-only · **—** none

| Capability | owner | manager | reception | trainer | accountant |
|---|:--:|:--:|:--:|:--:|:--:|
| **Door & attendance** ||||||
| Check a member in | ● | ● | ● | ● | — |
| Manual admit override (denied member) | ● | ● | ● | — | — |
| Retroactively edit a check-in | ● | ● | — | — | — |
| View attendance history | ● | ● | ● | ◐ own students | ○ |
| **People** ||||||
| Create lead / member | ● | ● | ● | ● | — |
| Edit member profile | ● | ● | ● | — | — |
| View member mobile / national ID | ● | ● | ● | ◐ own students | ○ |
| Soft-delete a member | ● | ● | — | — | — |
| Export member list | ● | — | — | — | — |
| **Memberships** ||||||
| Sell a membership | ● | ● | ● | — | — |
| Apply a discount | ● | ● | ◐ ≤ cap | — | — |
| Freeze / unfreeze | ● | ● | ● | — | — |
| Cancel with refund | ● | ● | — | — | — |
| Create / edit plans & prices | ● | ● | — | — | — |
| **Money** ||||||
| Take a payment | ● | ● | ● | — | ● |
| Sell from buffet / POS | ● | ● | ● | — | — |
| Top up member wallet | ● | ● | ● | — | ● |
| **Write off arrears** | ● | ◐ ≤ cap | — | — | — |
| Post a manual ledger adjustment | ● | — | — | — | ● |
| Open / close cash drawer | ● | ● | ● | — | ● |
| View drawer variance report | ● | ● | ◐ own shift | — | ● |
| View org-wide revenue | ● | ● | — | — | ● |
| View another location's revenue | ● | ◐ assigned | — | — | ● |
| **Lockers & retail** ||||||
| Assign / release locker | ● | ● | ● | — | — |
| Set VIP locker pricing | ● | ● | — | — | — |
| Adjust stock / stocktake | ● | ● | ◐ count only | — | ○ |
| **Automation & messaging** ||||||
| Enable / disable a recipe | ● | ● | — | — | — |
| Edit recipe message copy | ● | ● | — | — | — |
| Send a manual bulk SMS | ● | ◐ ≤ cap | — | — | — |
| Send a single SMS to one member | ● | ● | ● | — | — |
| Buy SMS credit | ● | — | — | — | ● |
| **Retention** ||||||
| View at-risk list | ● | ● | ● | ◐ own students | — |
| **Staff** ||||||
| Create / edit staff, assign roles | ● | ◐ not owner | — | — | — |
| Set trainer commission rules | ● | ● | — | — | ○ |
| Run / close a settlement period | ● | ● | — | ○ own | ● |
| **Org** ||||||
| Edit org settings, locations | ● | ◐ assigned | — | — | — |
| Run a data import | ● | ● | — | — | — |
| Full data export | ● | — | — | — | ○ |
| View audit log | ● | ◐ assigned | — | — | ○ |
| Manage billing / subscription | ● | — | — | — | — |

---

## 2. The fraud surface — read this before implementing

Gym cash handling is the classic internal-fraud point, and the two Iranian
market realities make it worse: most tuition is paid in cash or card-to-card,
and arrears are endemic, which gives cover to a whole class of theft.

**Three attacks the permission model must close:**

| Attack | Control |
|---|---|
| Receptionist takes cash, never records the payment; member shows as in arrears and eventually gets chased | Daily **drawer close with variance report**. Counted cash vs. ledger cash for that shift, by that staff member. Variance is visible to the owner on the dashboard, not buried in a report. |
| Receptionist records the payment, then writes off the arrears and pockets the cash | **Receptionists cannot write off arrears at all.** Manager write-offs are capped and audit-logged with a mandatory reason. Owner sees a monthly write-off total. |
| Receptionist sells a membership at full price, records a discount, keeps the difference | Discount capped per role, and **every discount over the cap requires a manager PIN** recorded in `auditLog`. Owner dashboard shows discount rate by staff member — an outlier is the signal. |

**Implementation rules:**

- Every money-moving action writes an `auditLog` row with `before`/`after`. No exceptions, no configuration to turn it off.
- Caps (`discount_max_pct`, `writeoff_max_rial`, `bulk_sms_max_recipients`) are per-org settings with sane defaults, not hardcoded.
- The variance report is a **first-class dashboard tile**, not a buried report. If the owner has to go looking, they won't.

One caution: don't present this to the customer as anti-fraud tooling. Iranian
gym owners often employ family members. Sell it as **"know your numbers close
correctly every night."** Same feature, sellable framing.

---

## 3. Enforcement

Three layers, all required:

1. **Postgres RLS** — `org_id` isolation. The backstop that survives an application bug.
2. **Server-side policy check** — role + cap + location scope, evaluated per request. The authoritative layer.
3. **UI affordance** — hide what the user can't do, so they never hit a wall.

UI hiding is never a security control. Assume every endpoint is called directly.

**Scoping note:** `manager` and `trainer` are scoped by `staffLocation`. A
manager at branch A must not read branch B's revenue. Bake location scope into
the policy check from the start — retrofitting it once multi-branch customers
exist means auditing every query.
