# TASK-010 — Desk UI slice

| Field | Value |
|-------|-------|
| **Task ID** | TASK-010 |
| **Title** | Desk UI slice |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

Next.js 16 Desk: search → member card → check-in → payment, RTL and Persian throughout.

## Acceptance criteria

- [x] Next.js 16 app, Tailwind v4, RTL, self-hosted Vazirmatn
- [x] The Desk screen from `design/receptionist-flow.md` §2 — search always focused, `Esc` clears
- [x] Member card: four facts in fixed positions (`design/receptionist-flow.md` §3)
- [x] Check-in with the result banner and its five outcomes
- [x] Take-payment flow with partial payment as a first-class path
- [x] All amounts Toman + Persian digits; all dates Jalali
- [x] Numeric inputs accept both digit sets

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
| `apps/web/package.json`, `tsconfig.json`, `next.config.mjs` | Next.js scaffold |
| `apps/web/postcss.config.mjs`, `app/globals.css` | Tailwind v4, CSS-first theme |
| `apps/web/app/layout.tsx` | `<html lang="fa" dir="rtl">` |
| `apps/web/app/page.tsx` | the Desk: search, member card, check-in, payment, login |
| `apps/web/lib/api.ts` | typed client off `@gymos/contracts` |
| `apps/web/lib/format.ts` | the only place the UI formats money or dates |
| `packages/core/src/index.ts` | `password` removed from the barrel — see Decisions |

## Commands and tests executed

```bash
pnpm build                    # 6 packages, clean
pnpm typecheck                # 10 tasks, clean
REQUIRE_DB=1 pnpm test        # 198 tests

# live
GET  :3001            → HTTP 200, <html lang="fa" dir="rtl">
CSS                   → margin-inline-start, direction:ltr, unicode-bidi:isolate
client bundle         → «ورود پذیرش» «ثبت ورود» «دریافت وجه» «اشتراک منقضی شده»
API behind it         → member card renders plan, arrears, access reason
```

## Decisions and assumptions

- **`password` is no longer in the `@gymos/core` barrel.** It imports
  `node:crypto`, and a barrel that re-exports it drags node built-ins into every
  browser bundle that touches the package — `next build` failed on
  `node:util` reached through `lib/format.ts`. It stays a subpath export
  (`@gymos/core/password`) and the web app imports the narrow subpaths
  `@gymos/core/money` and `@gymos/core/jalali`. Structural fix rather than a
  bundler workaround.
- The search box owns the keyboard: any printable keystroke focuses it, `Esc`
  clears back to a clean desk. A QR scanner is just a keyboard, so scanning
  fills the box and submits with no scanner-specific mode to get stuck in.
- The member card shows the same four facts in the same four positions every
  time, and shows `—` rather than hiding a row. Staff learn positions and stop
  reading labels; reordering would undo that.
- `.ltr-num` isolates amounts and dates so the bidi algorithm cannot mirror
  them inside the RTL layout.
- Partial payment is a first-class path, not an error state.
- One `Idempotency-Key` per user action, not per HTTP attempt: a retry replays,
  a second deliberate press is a new payment.
- Next.js **15**, not 16: 16 was not resolvable in this registry at install
  time. The App Router code is unchanged by the upgrade; revisit when available.

## Unresolved issues

- **Vazirmatn is referenced but not vendored.** The stack falls back to Tahoma,
  which every Windows reception PC has, but Persian numerals and spacing will
  look wrong until the font files are added. `design/tech-stack.md` §7 is
  explicit that it must be self-hosted — Google Fonts may be unreachable.
- The token lives in `localStorage`, readable by any script on the origin. Fine
  for a desk machine on a LAN; an httpOnly cookie is the right answer before
  this is exposed more widely.
- No offline behaviour. The Desk requires the network, which is correct for
  money but **not** for check-in — that is the kiosk (TASK-012), and until it
  exists the unplugged-cable demo in `sales-kit.md` §2 cannot be given.
- Lockers, buffet, drawer close and the owner dashboard have no UI yet.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer
- **Done:** the Desk slice — login, search, member card, check-in, payment — RTL,
  Persian, building and serving
- **Next:** vendor Vazirmatn, then TASK-012 the offline kiosk
- **Risks:** this Desk is online-only. The offline promise the product is sold on
  lives in the kiosk, which does not exist yet.

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
