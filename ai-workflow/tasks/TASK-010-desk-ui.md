# TASK-010 — Desk UI slice

| Field | Value |
|-------|-------|
| **Task ID** | TASK-010 |
| **Title** | Desk UI slice |
| **Status** | `planned` |
| **Current agent / owner** | — |
| **Role** | implementer |

## Goal

Next.js 16 Desk: search → member card → check-in → payment, RTL and Persian throughout.

## Acceptance criteria

- [ ] Next.js 16 app, Tailwind v4, RTL, self-hosted Vazirmatn
- [ ] The Desk screen from `design/receptionist-flow.md` §2 — search always focused, `Esc` clears
- [ ] Member card: four facts in fixed positions (`design/receptionist-flow.md` §3)
- [ ] Check-in with the result banner and its five outcomes
- [ ] Take-payment flow with partial payment as a first-class path
- [ ] All amounts Toman + Persian digits; all dates Jalali
- [ ] Numeric inputs accept both digit sets

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/receptionist-flow.md`](../../design/receptionist-flow.md)

## Out of scope

Offline/kiosk (TASK-012). Owner dashboard. Member portal. Lockers, buffet, drawer close.

## Implementation plan

1. Next scaffold, RTL layout, font, theme tokens
2. API client generated from `@gymos/contracts`
3. Desk screen + member card
4. Check-in and payment dialogs

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
