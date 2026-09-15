# TASK-003 — Database package

| Field | Value |
|-------|-------|
| **Task ID** | TASK-003 |
| **Title** | Database package |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

`@gymos/db` — Drizzle schema for the MVP tables, migrations, the hand-written guards, and a realistic 600-member Persian seed.

## Acceptance criteria

- [x] Schema covers MVP tables from `design/schema.ts` (org/location/staff/person/plan/membership/freeze/ledger×4/payment/mandate/collection/access_snapshot/check_in/device/locker×2/product/pos×2/event/scheduled_trigger/automation×2/message/sms_credit/risk_score/import×2/holiday/audit)
- [x] `drizzle/0000_init.sql` generated; `drizzle/0001_guards.sql` hand-written and never regenerated
- [x] Guards apply: RLS on every tenant table, ledger balance constraint trigger, append-only triggers, `v_member_arrears`
- [x] `pnpm db:migrate` succeeds against the container
- [x] `pnpm db:seed` creates 1 org, 600 members, mixed ي/ی names, ~30% arrears aged 3–90d, session-count + duration plans, frozen members, 90 days attendance
- [x] Seeded arrears total matches the sum of `v_member_arrears`

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/domain-model.md`](../../design/domain-model.md) · [`design/schema.ts`](../../design/schema.ts) · [`design/0001_guards.sql`](../../design/0001_guards.sql)

## Out of scope

Booking, programs, body measurements, corporate accounts, invoices (V1/V2 per the PRD).

## Implementation plan

1. `schema.ts` — Trend style: `(table) => ({...})` index callback, `withTimezone: true`, `$inferSelect`/`$inferInsert` pairs
2. `client.ts` (postgres.js, `getDb`/`createDb`/`closeDb`), `migrate.ts`, `seed.ts`
3. `drizzle-kit generate` for 0000; copy `design/0001_guards.sql` as the permanent hand-written guard migration
4. Persian name corpus + believable distributions in `seed-data/`

## Files changed

| Path | Change |
|------|--------|
| `packages/db/src/schema.ts` | 37 tables, 919 lines, Trend conventions |
| `packages/db/src/client.ts` | postgres.js; owner vs app connection split |
| `packages/db/src/migrate.ts` | drizzle migrator, owner connection |
| `packages/db/src/seed.ts` | deterministic 600-member Persian gym |
| `packages/db/src/seed-data/names.ts` | name corpus incl. Arabic-codepoint variants |
| `packages/db/drizzle/0000_init.sql` | generated |
| `packages/db/drizzle/0001_guards.sql` | hand-written: RLS, balance trigger, append-only, views |
| `packages/db/src/guards.test.ts` | 13 integration tests against real Postgres |

## Commands and tests executed

```bash
docker compose up -d postgres redis   # both healthy
pnpm db:generate --name=init          # 37 tables
pnpm db:migrate                       # 0000 + 0001 applied
pnpm db:seed                          # 600 people / 4944 check-ins / balanced
REQUIRE_DB=1 pnpm test                # 113 tests pass
```

## Decisions and assumptions

- **D-001** `person(org_id, mobile)` unique — reversible, migration pre-written.
- **D-005** `drizzle-kit generate` used for 0000; `0001_guards.sql` is hand-written and registered in `_journal.json` manually with no snapshot.
- **D-007** enum-ish columns are `text` + app-layer Zod, not `pgEnum`.
- **D-008** deleting an org requires `SET LOCAL session_replication_role = replica` — the append-only triggers reject cascade DELETEs by design, and `gymos_app` cannot set it, so the API can never delete history.

## Unresolved issues

- Seeded arrears total is 434,370,000 Toman across 179 members — plausible for a 557-member gym, and the figure the product sells against. Worth sanity-checking against real gym data once the visits happen.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-004)
- **Done:** schema, migrations, guards, seed — all verified against live Postgres
- **Next:** TASK-004 API foundation (Nest+Fastify, DatabaseModule, `withOrg` interceptor)
- **Risks:** seed wipe depends on the owner connection; never expose that path to the API

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
