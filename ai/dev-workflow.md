# Building GymOS Solo with Claude Code

You are one developer shipping and supporting a production financial system.
AI assistance is the difference between a 10-month MVP and a 5-month one — but
only if you are disciplined about where it is allowed to operate.

---

## 1. The rule

> **AI writes the code. You own the invariants.**

Four things in this system, if silently wrong, are unrecoverable: the ledger,
money formatting, Jalali bucketing, and tenant isolation. Everything else is a
bug you fix on Tuesday.

| Delegate freely | Review line by line | Write yourself |
|---|---|---|
| CRUD endpoints | Anything touching `ledger_entry` | The balance invariant |
| UI components, forms, tables | RLS policies | The `withOrg` tenant helper |
| Migration parsers & column mapping | Jalali month/week boundaries | Nothing else — but read everything in column 2 |
| Reports and dashboard queries | Idempotency key construction | |
| Test scaffolding | The offline outbox flush | |
| Persian copy drafts | AI tool definitions (`orgId` scoping) | |

The middle column is short on purpose. Reviewing everything means reviewing
nothing.

---

## 2. CLAUDE.md for the repo

Put this at the repo root on day one. It is the highest-leverage file you will
write — every session inherits it.

```markdown
# GymOS

Gym management SaaS for the Iranian market. Solo-maintained. Production system
handling real money.

## Invariants — never violate these

1. **Money is integer Rial.** Never float, never store Toman. Display converts
   at the form boundary via `money.ts`, nowhere else.
2. **No stored balances.** Arrears is the balance of a `member_receivable`
   account. Corrections are reversing ledger transactions, never edits.
3. **Append-only tables:** ledger_entry, check_in, stock_movement,
   sms_credit_ledger, audit_log. No UPDATE, no DELETE, ever.
4. **Every tenant query goes through the org helper** which sets
   `app.org_id`. Never filter by org in application code alone.
5. **Jalali conversions go through `jalali.ts`.** Never call a date library
   directly from a component or a query. Week starts Saturday.
6. **Every numeric input accepts Persian AND Latin digits** via
   `normalizeDigits`. Every name search normalises ي→ی and ك→ک.
7. **Money endpoints require an Idempotency-Key.**
8. **Check-in must work offline.** Never add a server round-trip to the
   admission path. The kiosk is `apps/kiosk` (Vite PWA), never a Next.js route.
9. **Only `apps/api` touches Postgres.** Next.js server components call the API
   over HTTP like every other client. Two writers = two places to enforce the
   ledger invariant.
10. **Internal packages export `src`, never `dist`.** No build step between
   packages — that is how stale builds get served.

## Conventions

- Persian in UI, English in code. One Persian term per concept — see
  `product/glossary.md`. Never Persian identifiers in code.
- Errors: stable English `code`, Persian `message` shown verbatim to the user.
  An error says what went wrong and what to do next.
- Amounts render LTR inside the RTL layout.
- Never show a Rial figure or a Gregorian date to a user.

## Commands

- `pnpm test` / `pnpm typecheck` — Turborepo, whole monorepo
- `pnpm --filter @gymos/core test` — one package

## Before you finish

- Ran the tests, they pass.
- Touched the ledger? The balance test still passes.
- Added a tenant table? RLS policy added to `0001_guards.sql`.
- Added a numeric input? It accepts Persian digits.

## Reference

`design/domain-model.md` · `design/api-design.md` · `design/offline-sync.md` ·
`product/principles.md`
```

Keep it under a page. A CLAUDE.md nobody re-reads is a CLAUDE.md that drifts.

---

## 3. Workflow per feature

```
1. Read the spec section     → the docs already say what to build
2. Plan mode                 → agree the approach before code exists
3. Implement                 → delegate freely
4. Tests for the invariants  → non-negotiable if column 2 was touched
5. /code-review              → before commit, not after
6. Run it against real data  → your own seeded gym
```

Step 1 is why the planning pack exists. You are rarely asking "what should this
do" — you are asking "implement `automation-engine.md` §3". Point at the section.
A task grounded in a written spec produces work you can actually check.

Step 6 catches what tests don't: a 600-member seeded gym with realistic Persian
names, arrears, and freezes surfaces the ي/ی bug, the RTL number bug, and the
slow search immediately.

---

## 4. Where AI assistance goes wrong on this project specifically

| Failure | Guard |
|---|---|
| Generates `balance` columns because that's the common pattern | Invariant 2 in CLAUDE.md, and the ledger tests |
| Uses `new Date()` / `getDay()` directly | Invariant 5, plus the Saturday test |
| Writes `WHERE org_id = $1` and calls it isolation | Invariant 4, plus the RLS cross-tenant test in CI |
| Stores Toman "for simplicity" | Invariant 1, plus the money tests |
| Adds a server call to check-in for correctness | Invariant 8 — and it is correct, which is the trap. Precomputed staleness is the deliberate trade |
| Fixes a failing test by changing the assertion | **Read every test diff.** A green suite that was edited to be green is worse than a red one |
| Adds features from the original 90-item brief | `product/scope-freeze.md`. Say no |

That last row is the real risk. The strategy report names roadmap sprawl as the
most likely failure mode, and an eager assistant will happily build the website
builder you cut.

---

## 5. Seed data — build this early

A realistic seed is the highest-value non-feature you can build:

- 600 members, real Persian names, mixed ي/ی spellings
- ~30% with arrears, aged 3–90 days
- Session-count and duration plans, some frozen
- 90 days of attendance with believable per-member baselines
- Two staff, one locker bank, a buffet with stock

It makes every demo instant, every performance budget measurable, and every
Persian text bug visible on day one instead of at a gym.

---

## 6. What not to delegate

**The three week-one spikes.** The PSP call, the controller teardown, the
incumbent data files — those are phone calls, site visits and a screwdriver. No
amount of code assistance substitutes for them, and they are what actually gates
the project.

**The ten gym visits.** The only source of the answer to the one open question
that can still change the schema.

**The decision to say no.** Scope discipline is the whole job in a solo build.
Nothing will make that call for you.
