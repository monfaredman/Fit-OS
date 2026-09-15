# TASK-005 — Auth & RBAC

| Field | Value |
|-------|-------|
| **Task ID** | TASK-005 |
| **Title** | Auth & RBAC |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

Staff authentication and the permission matrix from `design/permissions.md`.

## Acceptance criteria

- [ ] `POST /v1/auth/staff/login` (mobile + password) issues a session
- [ ] `StaffAuthGuard` + `RolesGuard`; `@CurrentUser()` decorator; `AuthUser` exported from the guard file
- [ ] Roles: owner · manager · receptionist · trainer · accountant
- [ ] Caps enforced server-side: `discount_max_pct`, `writeoff_max_rial`
- [ ] Guard unit tests (fake `ExecutionContext`, Trend style)
- [ ] Login rate-limited by mobile

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
