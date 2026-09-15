# TASK-006 — People & search

| Field | Value |
|-------|-------|
| **Task ID** | TASK-006 |
| **Title** | People & search |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

The Desk's hot path: find a member, see the card.

## Acceptance criteria

- [ ] `GET /v1/search?q=` — name, mobile, member number; Persian digits and ي/ی both match
- [ ] p95 < 400 ms on the 600-member seed
- [ ] `GET /v1/people/:id` returns the member-card payload from `design/api-design.md` §5
- [ ] `POST /v1/people`, `PATCH /v1/people/:id`
- [ ] One `person` table with `stage` — leads and members are not separate (D per domain-model §1.3)
- [ ] Search normalisation covered by tests

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
