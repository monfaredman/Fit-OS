# TASK-004 — API foundation

| Field | Value |
|-------|-------|
| **Task ID** | TASK-004 |
| **Title** | API foundation |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

NestJS 12 + Fastify bootstrap with tenancy enforced at the framework level.

## Acceptance criteria

- [ ] `main.ts`: Fastify adapter, `trustProxy`, `genReqId`, pino, global `ZodExceptionFilter`, Swagger at `/docs`
- [ ] `@Global() DatabaseModule` exposing `DB = Symbol('DB')`
- [ ] `withOrg(orgId, fn)` helper + interceptor — a route cannot reach the DB outside a tenant scope
- [ ] `GET /health` returns db + redis status
- [ ] Error envelope matches `design/api-design.md` §3 (English `code`, Persian `message`)
- [ ] Cross-tenant RLS test passes and runs in CI

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
| | |

## Commands and tests executed

```bash
```

## Decisions and assumptions

- …

## Unresolved issues

- …

## Review findings

- …

## Handoff notes

- **From → To:**
- **Done:**
- **Next:**
- **Risks:**

## Definition-of-done checklist

- [ ] Acceptance criteria met
- [ ] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [ ] Files changed listed
- [ ] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [ ] Handoff notes updated
