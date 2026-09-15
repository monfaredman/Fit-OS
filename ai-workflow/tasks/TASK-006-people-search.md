# TASK-006 — People & search

| Field | Value |
|-------|-------|
| **Task ID** | TASK-006 |
| **Title** | People & search |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

The Desk's hot path: find a member, see the card.

## Acceptance criteria

- [x] `GET /v1/search?q=` — name, mobile, member number; Persian digits and ي/ی both match
- [x] p95 < 400 ms on the 600-member seed
- [x] `GET /v1/people/:id` returns the member-card payload from `design/api-design.md` §5
- [x] `POST /v1/people`, `PATCH /v1/people/:id`
- [x] One `person` table with `stage` — leads and members are not separate (D per domain-model §1.3)
- [x] Search normalisation covered by tests

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/api-design.md`](../../design/api-design.md) §5 · [`design/receptionist-flow.md`](../../design/receptionist-flow.md) §3

## Out of scope

Lead pipeline / CRM (V1). Photos upload.

## Implementation plan

1. `people.module/controller/service`
2. `search.ts` pure module: normalise → build query → rank. Tested standalone
3. Trigram index on normalised name; btree on mobile
4. Member-card assembly reusing `v_member_arrears` and `access_snapshot`

## Files changed

| Path | Change |
|------|--------|
| `apps/api/src/people/search.ts` | pure query analysis + ranking |
| `apps/api/src/people/search.test.ts` | 14 tests |
| `apps/api/src/people/people.service.ts` | search, member card, create, update |
| `apps/api/src/people/people.controller.ts` | `/v1/search`, `/v1/people/:id`, POST, PATCH |
| `apps/api/src/people/people.module.ts` | wiring |
| `packages/db/src/cleanup-orphans.ts` | repeatable repair for pre-D-009 databases |

## Commands and tests executed

```bash
REQUIRE_DB=1 pnpm test        # 155 tests, 9 tasks
pnpm typecheck && pnpm build  # clean
pnpm db:cleanup               # 0 orphans, ledger balanced

# live, against the seeded gym
GET /v1/search?q=رضایی          → 3 members
GET /v1/search?q=رضايي (Arabic)  → identical results
GET /v1/search?q=۷۵۰۰ (Persian)  → matched by mobile tail
search latency                   → p50 16ms, p95 21ms (budget 400ms)
GET /v1/people/:id               → all four facts, Toman + Jalali-ready
POST /v1/people duplicate mobile → DUPLICATE_MOBILE
```

## Decisions and assumptions

- **No TenantInterceptor after all.** Service methods take the authenticated
  `AuthUser`, not a bare `orgId` string, so a controller can only pass the
  principal it was handed — it cannot name an arbitrary org. That closes the
  footgun the interceptor existed for, without AsyncLocalStorage machinery.
- Ambiguous digit queries run both interpretations. `1042` is planned as a
  member number but keeps the mobile fallback, so a wrong guess costs one extra
  index probe rather than a wrong answer.
- Ranking is computed in the application, not SQL, so the rule is readable and
  unit-testable. Ties break on name, so results do not jitter between keystrokes.
- `searchName` is derived on every write. Letting it drift from the name it
  indexes is how search silently stops finding people.

## Unresolved issues

- Search uses `LIKE '%needle%'`, which cannot use the trigram index for the
  leading wildcard on small result sets. Fine at 600 members (p95 21ms);
  revisit with `pg_trgm` similarity or a tsvector when a gym passes ~5,000.
- `NOT IN (subquery)` silently deletes nothing under FORCE RLS. `cleanup-orphans.ts`
  uses `NOT EXISTS`. Worth remembering for any future maintenance SQL.
- Member photos are modelled (`photo_key`) but there is no upload path yet.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-007)
- **Done:** search and the member card, live and inside budget
- **Next:** TASK-007 plans & memberships — sell, freeze, renew, with ledger posting
- **Risks:** the database carried orphaned rows from the D-009 bug (3 orgs' worth).
  Cleaned, and `pnpm db:cleanup` makes the repair repeatable for any other
  machine seeded before the fix.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
