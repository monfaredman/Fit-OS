# GymOS — Planning Pack

Everything needed to start building. Read in this order.

---

## Read first

**[`gymos-iran-teardown.html`](gymos-iran-teardown.html)** — the strategy.
Open in a browser. Verdict: **GO — with changes.** Five premises in the original
brief turned out wrong; the wedge is money collection, not AI.

One correction since it was written: **it tells you to publish a 3-year TCO
comparison. Don't** — the numbers favour the incumbents. See `sales-kit.md` §0.

---

## Before you build — week 1

| Doc | Use |
|---|---|
| **[`design/gym-visit-script.md`](design/gym-visit-script.md)** | Print 10 copies. Take them to 10 gyms. This ends the planning phase. |
| **[`design/sales-kit.md`](design/sales-kit.md)** | Read before visit 1 — the qualifying question and what not to say |

**Two phone calls, day 1:**

1. **Zarinpal** — *«آیا پرداخت مستقیم برای شخص حقیقی فعال می‌شود؟»* This answer determines your quarter. Details: `design/direct-debit.md` §1.
2. **SMS provider** — can you send on a shared line without a registered entity? If not, the arrears wedge is blocked too.

**Then register the entity**, of the type the PSP answer tells you qualifies.
Filing the wrong structure and finding out later is the expensive mistake.

---

## Product

| Doc | Covers |
|---|---|
| [`product/prd.md`](product/prd.md) | Problem, users, jobs, scope, success metrics, non-goals |
| [`product/scope-freeze.md`](product/scope-freeze.md) | The 13 items. Sign it, date it, refuse to amend it |
| [`product/principles.md`](product/principles.md) | Eleven decision rules for every future feature request |
| [`product/glossary.md`](product/glossary.md) | Canonical Persian terms ↔ English ↔ code. One word per concept |
| [`product/onboarding.md`](product/onboarding.md) | Day 0–30 for a new gym, and the day-28 conversation |
| [`product/member-app.md`](product/member-app.md) | Member PWA. V1 — exists to carry mandate capture |

---

## Build reference

| Doc | Covers |
|---|---|
| [`design/domain-model.md`](design/domain-model.md) | Eight load-bearing decisions, ERD, worked examples, open questions |
| [`design/schema.ts`](design/schema.ts) | Drizzle schema, tagged `[MVP]` / `[V1]` / `[V2]` |
| [`design/0001_guards.sql`](design/0001_guards.sql) | RLS, ledger balance constraint, append-only triggers |
| [`design/receptionist-flow.md`](design/receptionist-flow.md) | The daily loop. Performance budgets are acceptance criteria |
| [`design/automation-recipes.md`](design/automation-recipes.md) | Six recipes with Persian copy. Your launch wedge |
| [`design/permissions.md`](design/permissions.md) | Role matrix + the cash-fraud controls |
| [`design/tech-stack.md`](design/tech-stack.md) | Stack, hosting, deployment, what to test |
| [`design/api-design.md`](design/api-design.md) | HTTP contract, error catalogue, idempotency, latency budgets |
| [`design/offline-sync.md`](design/offline-sync.md) | The sync protocol. The hardest piece, and the demo that wins deals |
| [`design/automation-engine.md`](design/automation-engine.md) | Trigger runtime, suppression, risk scoring, the hold-out |
| [`design/operations.md`](design/operations.md) | Alerts, metrics, backups, deploys, incidents, support |
| [`design/migration-extractor.md`](design/migration-extractor.md) | The 48-hour switch service |
| [`design/direct-debit.md`](design/direct-debit.md) | The wedge — blocked on the PSP call |
| [`design/hardware-bridge.md`](design/hardware-bridge.md) | Specified, not scheduled. Post-MVP |

---

## AI

| Doc | Covers |
|---|---|
| [`ai/product-ai.md`](ai/product-ai.md) | Ask GymOS and Actions — cost arithmetic, tenant isolation, prompt injection, code |
| [`ai/dev-workflow.md`](ai/dev-workflow.md) | Building this solo with Claude Code. CLAUDE.md, what to delegate, what not to |

---

## Code

| [`packages/core/`](packages/core/) | Domain core: money, Jalali, ledger. **94 tests passing** |
| [`CLAUDE.md`](CLAUDE.md) | Repo invariants — every Claude Code session inherits this |

Monorepo: pnpm + Turborepo. `apps/api` (NestJS 12) · `apps/web` (Next.js 16) ·
`apps/kiosk` (Vite PWA) · `packages/{core,db,contracts}` · `agent/` (Go).
Stack rationale and the tradeoff: [`design/tech-stack.md`](design/tech-stack.md).

---

## Blocked, and on what

| Work | Waiting on |
|---|---|
| Migrations | Gym visit Q1 — shared family phone numbers. **The only open question that can still change the schema.** `0001_guards.sql` §5 has the exact change if the answer is yes |
| Extractor implementation | A real incumbent data file — ask for one at every visit |
| Hardware bridge | Controller models and protocols from the teardown |
| Direct debit | PSP eligibility answer + entity registration |

---

## Build order once unblocked

1. Desk + search + member card, read-only
2. Check-in, online
3. New member + payment + the ledger
4. **Offline queue + snapshot cache** — before any real gym uses it
5. SMS engine with idempotency and quiet hours
6. `arrears_reminder` ← the first thing worth demoing
7. Expiry recipes + suppression engine
8. Owner mobile tiles
9. Buffet, lockers, drawer close
10. Migration tooling, hardened

Full reasoning: `gymos-iran-teardown.html` §11.

---

## The one number that matters

Average uncollected tuition across the 10 gyms you visit. It's the first sentence
of every sales conversation for the next two years, and it cannot be obtained
from a desk.

---

*Research conducted September 2026. Competitor pricing and filtering status are
time-sensitive — re-verify Gymona's and 1club's pricing before quoting either.*
