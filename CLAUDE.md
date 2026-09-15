# Claude Code — GymOS

Shared workflow hub. **Do not duplicate process rules here.**

## Before any work

1. Read `ai-workflow/PROJECT.md`
2. Read `ai-workflow/WORKFLOW.md`
3. Read the active task under `ai-workflow/tasks/` (create from `ai-workflow/TASK_TEMPLATE.md` if none)

Use **pnpm** / `pnpm --filter @gymos/<pkg>`, never `npm --filter`.
Never run an app without turbo — see PROJECT.md (D-002).

---

## The eight invariants — never violate these

Kept here because this file is loaded into every session. The first four are
unrecoverable if violated silently.

1. **Money is integer Rial.** Never float, never store Toman. Display converts at
   the form boundary via `@gymos/core` `money.ts`, nowhere else.
2. **No stored balances.** Arrears is the balance of a `member_receivable`
   account. Corrections are reversing ledger transactions, never edits.
3. **Append-only tables:** `ledger_entry`, `check_in`, `stock_movement`,
   `sms_credit_ledger`, `audit_log`. No UPDATE, no DELETE, ever.
4. **Every tenant query goes through `withOrg`**, which sets `app.org_id`.
   Never filter by org in application code alone.
5. **Jalali conversions go through `@gymos/core` `jalali.ts`.** Never call a date
   library directly from a component or a query. Week starts Saturday.
6. **Every numeric input accepts Persian AND Latin digits** (`normalizeDigits`).
   Every name search normalises `ي→ی` and `ك→ک` (`normalizePersianText`).
7. **Money endpoints require an `Idempotency-Key`.**
8. **Check-in must work offline.** Never add a server round-trip to the admission
   path. The kiosk is `apps/kiosk` (Vite PWA), never a Next.js route.

Touching 1–4 without adding or extending a test is a review rejection.

## Conventions

- ESM everywhere. `.js` extensions on relative imports. Flat feature folders:
  `people.module.ts` · `people.controller.ts` · `people.service.ts`.
- **No ZodValidationPipe.** Controllers call `schema.parse(body)` inline; the
  global `ZodExceptionFilter` maps `ZodError` → 400. Schemas live in
  `@gymos/contracts`, named `xxxSchema` + inferred type.
- Persian in UI, English in code. One Persian term per concept —
  `product/glossary.md`. Never Persian identifiers in code.
- Errors: stable English `code`, Persian `message` shown verbatim. An error says
  what went wrong and what to do next — no apologies.
- Tests: vitest, `<subject>.test.ts` alongside source. Extract pure logic into
  plain modules and test that; do not instantiate Nest services with mock DBs.

## Commands

```bash
pnpm dev · pnpm test · pnpm typecheck · pnpm lint · pnpm build
pnpm db:migrate · pnpm db:seed
pnpm --filter @gymos/core test
```

## Before you finish

- Ran the tests, they pass.
- Touched the ledger? The balance test still passes.
- Added a tenant table? RLS policy added to `packages/db/drizzle/0001_guards.sql`.
- Added a numeric input? It accepts Persian digits.
- Task file updated: status, files changed, commands run, handoff notes.

Reference: `design/domain-model.md` · `design/api-design.md` ·
`design/offline-sync.md` · `product/principles.md`
