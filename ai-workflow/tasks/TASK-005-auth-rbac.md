# TASK-005 — Auth & RBAC

| Field | Value |
|-------|-------|
| **Task ID** | TASK-005 |
| **Title** | Auth & RBAC |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Staff authentication and the permission matrix from `design/permissions.md`.

## Acceptance criteria

- [x] `POST /v1/auth/staff/login` (mobile + password) issues a session
- [x] `StaffAuthGuard` + `RolesGuard`; `@CurrentUser()` decorator; `AuthUser` exported from the guard file
- [x] Roles: owner · manager · receptionist · trainer · accountant
- [x] Caps enforced server-side: `discount_max_pct`, `writeoff_max_rial`
- [x] Guard unit tests (fake `ExecutionContext`, Trend style)
- [x] Login rate-limited by mobile

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/permissions.md`](../../design/permissions.md)

## Out of scope

Member OTP auth (V1, TASK-011). better-auth evaluation — see risk note.

## Implementation plan

1. `auth.module/controller/service`, argon2 hashing
2. Guards + decorator + tests
3. Permission matrix as a pure, tested module (`permissions.ts`)
4. Wire caps into the money and membership services

## Risk

`design/tech-stack.md` §5 flags **better-auth**: it generates and manages its own
schema, which must be reconciled with RLS. This task ships a hand-rolled guard
first (Trend's proven pattern, zero unknowns). Evaluate better-auth separately
before member OTP lands — do not couple that decision to this task.

## Files changed

| Path | Change |
|------|--------|
| `packages/core/src/password.ts` | scrypt hashing — moved here so the seed and API share it |
| `packages/core/src/password.test.ts` | 7 tests |
| `apps/api/src/auth/permissions.ts` | the matrix from design/permissions.md, as data |
| `apps/api/src/auth/permissions.test.ts` | 10 tests, incl. the three fraud controls |
| `apps/api/src/auth/rate-limit.ts` + test | fixed-window limiter, injectable clock, 5 tests |
| `apps/api/src/auth/staff-auth.guard.ts` | `AuthUser`, bearer → session, `hashToken` |
| `apps/api/src/auth/roles.guard.ts` | `CapabilityGuard` + `@RequireCapability()` |
| `apps/api/src/auth/current-user.decorator.ts` | `@CurrentUser()` |
| `apps/api/src/auth/auth.{service,controller,module}.ts` | login, me, logout |
| `apps/api/src/infra/tenant.db.ts` | `resolveSession` + `staffByMobile` via definer functions |
| `apps/api/src/app-exception.filter.ts` | Nest HTTP exceptions mapped to the Persian catalogue |
| `packages/db/drizzle/0002_auth_functions.sql` | two SECURITY DEFINER lookups |
| `packages/db/src/seed.ts` | staff password hashes; **corrected** org wipe |

## Commands and tests executed

```bash
pnpm db:migrate                       # 0002 applied
pnpm db:seed                          # 0 orphaned rows after wipe
REQUIRE_DB=1 pnpm test                # 141 tests, 9 tasks
pnpm typecheck && pnpm build          # clean

# verified live against the seeded gym
login (mobile in PERSIAN digits) → token + staff{role:receptionist}
/v1/auth/me  receptionist → 14 caps, arrears.writeoff FALSE
/v1/auth/me  owner        → 36 caps, arrears.writeoff TRUE
wrong password  ≡  unknown mobile  → identical UNAUTHENTICATED
logout → 204, token immediately rejected
6 rapid failures → RATE_LIMITED on the 6th
```

## Decisions and assumptions

- **D-009 (supersedes D-008)** — the org wipe must use `ALTER TABLE … DISABLE
  TRIGGER USER`, never `session_replication_role = replica`. The latter disables
  *system* triggers too, which is how Postgres implements foreign keys: the
  parent is deleted and every child is silently orphaned. Found because login
  returned four staff rows for one mobile, belonging to three organizations that
  no longer existed.
- **D-010** — auth bootstrap uses two `SECURITY DEFINER` functions rather than
  loosening RLS or connecting as the owner. `gymos_app` is NOBYPASSRLS, so an
  untenanted SELECT matches nothing and every login fails. Both functions pin
  `search_path` (mandatory — otherwise a caller can shadow `session`/`staff` and
  hijack the definer's privileges) and are granted to `gymos_app` alone.
- scrypt from `node:crypto`, not argon2/bcrypt: no native module, so no build
  step on a machine you cannot reach. Hash format is self-describing, so
  parameters can be raised without invalidating existing hashes.
- Login verifies against a dummy hash when no account matches, so a missing
  account and a wrong password take the same time — otherwise the endpoint is an
  account-enumeration oracle.
- `staff.mobile` is unique per org, not globally. Login collects all candidates
  and refuses when more than one verifies, rather than signing someone into the
  wrong gym.

## Unresolved issues

- **No `TenantInterceptor` yet.** `orgId` still travels as an argument to
  `withOrg`. Now that `@CurrentUser()` exists, an interceptor should derive it
  from the session so a controller cannot pass the wrong one. First item of
  TASK-006.
- OTP elevation is modelled (`session.elevated_until`, `AuthUser.elevated`) but
  no endpoint issues it yet — needed before owner-level destructive actions.
- The rate limiter is in-process. Correct for a single-process deployment;
  moves to Redis when the API scales horizontally. Interface stays.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-006)
- **Done:** staff login, sessions, guards, capability matrix, rate limiting — verified end to end
- **Next:** TASK-006 people & search, starting with the tenant interceptor
- **Risks:** the two SECURITY DEFINER functions are the only RLS bypass in the
  system. Any change to them is a security review, not a refactor.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
