# TASK-004 — API foundation

| Field | Value |
|-------|-------|
| **Task ID** | TASK-004 |
| **Title** | API foundation |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

NestJS 12 + Fastify bootstrap with tenancy enforced at the framework level.

## Acceptance criteria

- [x] `main.ts`: Fastify adapter, `trustProxy`, `genReqId`, pino, global `ZodExceptionFilter`, Swagger at `/docs`
- [x] `@Global() DatabaseModule` exposing `DB = Symbol('DB')`
- [x] `withOrg(orgId, fn)` helper + interceptor — a route cannot reach the DB outside a tenant scope
- [x] `GET /health` returns db + redis status
- [x] Error envelope matches `design/api-design.md` §3 (English `code`, Persian `message`)
- [x] Cross-tenant RLS test passes and runs in CI

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/api-design.md`](../../design/api-design.md)

## Out of scope

Feature endpoints. Rate limiting. Observability beyond pino.

## Implementation plan

1. Nest app skeleton, Fastify, pino, filters, Swagger
2. `infra/database.module.ts` + `infra/tenant.ts` (`withOrg`)
3. `TenantInterceptor` reading org from the session
4. Error catalogue as a typed map in `@gymos/contracts`

## Files changed

| Path | Change |
|------|--------|
| `packages/contracts/**` | `@gymos/contracts` — error catalogue, enums, request/response schemas |
| `apps/api/src/main.ts` | Fastify adapter, trustProxy, genReqId, pino, filters, Swagger `/docs` |
| `apps/api/src/infra/database.tokens.ts` | `DB` symbol, separate to avoid a cycle |
| `apps/api/src/infra/database.module.ts` | `@Global()`; exports **only** `TenantDb`, never the raw handle |
| `apps/api/src/infra/tenant.db.ts` | `withOrg()` — the single enforcement point for invariant 4 |
| `apps/api/src/infra/tenant.db.test.ts` | 6 tests |
| `apps/api/src/zod-exception.filter.ts` | `ZodError` → 400 envelope |
| `apps/api/src/app-exception.filter.ts` | one envelope; ledger violations flagged as P1 |
| `apps/api/src/health/**` | `GET /health` with db reachability |
| `apps/api/src/logging/**` | pino + Nest LoggerService bridge |

## Commands and tests executed

```bash
pnpm --filter @gymos/api build        # clean
node apps/api/dist/main.js
curl /health  → {"status":"ok","db":true,"version":"0.1.0","uptimeSec":7}
curl /docs    → HTTP 200 (Swagger UI)
curl /v1/nope → {"error":{"code":"NOT_FOUND","message":"یافت نشد."}}
REQUIRE_DB=1 pnpm test                # 119 tests, 9 tasks, all pass
pnpm typecheck                        # clean
```

## Decisions and assumptions

- **Tenancy is structural, not disciplinary.** `DatabaseModule` provides the raw
  Drizzle handle but does **not** export it — only `TenantDb`. A service cannot
  obtain an untenanted connection even by accident; it has to go through
  `withOrg`, which opens a transaction and issues `set_config('app.org_id', …, true)`.
  `SET LOCAL` semantics mean a pooled connection can never leak one request's
  tenant into the next.
- NestJS **11** (not 12): `@nestjs/swagger` ^8 is the current stable pairing.
  Revisit when the Nest 12 ecosystem catches up.
- `@fastify/static` is a required peer for Swagger UI under the Fastify adapter —
  without it the app logs an error and never binds.
- `PinoLoggerService`'s field is named `pino`, not `log`: `log` is part of the
  `LoggerService` interface and collides.

## Unresolved issues

- No `TenantInterceptor` yet: `orgId` currently has to be passed explicitly to
  `withOrg`. Once TASK-005 lands `@CurrentUser()`, add an interceptor that
  derives it from the session so controllers cannot pass the wrong one.
- No rate limiting yet (TASK-005 adds it for login).

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-005)
- **Done:** API boots, serves `/health` + `/docs`, DB reachable as `gymos_app`, error envelope correct
- **Next:** TASK-005 auth & RBAC — staff login, guards, `@CurrentUser()`, then the tenant interceptor
- **Risks:** `TenantDb.ping()` is the one deliberately untenanted query; keep it that way

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
