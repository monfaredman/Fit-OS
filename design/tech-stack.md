# GymOS — Stack & Infrastructure

Modern TypeScript monorepo. NestJS API, Next.js web, a separate offline-first
kiosk, and a Go bridge agent. Versions current as of September 2026.

---

## 1. The stack

| Layer | Choice | Version | Why this one |
|---|---|---|---|
| **API** | **NestJS** | 12.0.x | ESM-native, Standard Schema validation in route decorators, `@nestjs/observe` for telemetry, Rspack builds. One contract serving four clients |
| **Web** | **Next.js** | 16.3.x | Turbopack stable, App Router, React Compiler, client-side cache. Desk + owner + member portal |
| **Kiosk** | **Vite + React PWA** | Vite 7 | Deliberately *not* Next.js — see §3 |
| **DB** | **PostgreSQL** | 17 | RLS, `SKIP LOCKED`, deferred constraint triggers |
| **ORM** | **Drizzle** | 0.45.x | You know it; SQL-shaped; first-class RLS support, which a multi-tenant financial schema needs |
| **Validation** | **Zod** | 4.x | Single contract source, consumed by Nest 12's Standard Schema support *and* both frontends |
| **Auth** | **better-auth** | latest | Sessions, OTP, organizations, RBAC out of the box. Drizzle adapter. See the caveat in §5 |
| **Queue** | **BullMQ + Redis** | 5.x | Retries, backoff, delayed jobs, repeatable schedules. Fed by a Postgres outbox — §6 |
| **UI** | **Tailwind v4 + shadcn/ui** | — | Tailwind 4 emits logical properties by default, which is most of the RTL battle |
| **Test** | **Vitest** | 2.x | Nest 12's default for ESM projects. One runner across the whole repo |
| **Build** | **pnpm + Turborepo** | — | §4 — including the fix for the stale-`dist` problem |
| **Bridge** | **Go** | 1.23+ | Single `.exe`, no runtime on the gym's PC (`hardware-bridge.md` §1) |
| **Host** | **In-country VPS** | ParsPack / Arvan | Non-negotiable. §8 |

---

## 2. Layout

```
gymos/
├── apps/
│   ├── api/            NestJS 12 — the only process that touches Postgres
│   ├── web/            Next.js 16 — Desk, owner dashboard, member portal
│   └── kiosk/          Vite PWA — offline-first check-in terminal
├── packages/
│   ├── core/           money · jalali · ledger  (built, 94 tests green)
│   ├── db/             Drizzle schema + 0001_guards.sql + migrations
│   └── contracts/      Zod schemas → shared types → generated OpenAPI
├── agent/              Go bridge binary
└── turbo.json
```

**`apps/api` is the only thing with database credentials.** Next.js server
components call the API over HTTP like every other client. It is tempting to let
Next talk to Postgres directly "just for the dashboard" — don't. The moment two
processes write money you have two places to enforce the ledger invariant.

---

## 3. Why the kiosk is not a Next.js route

The single most important architectural call in this document.

The kiosk must boot from cache with **zero network**, hold the entire
`access_snapshot` in IndexedDB, and admit a member in under two seconds with the
cable unplugged (`offline-sync.md`). That is a client-only, offline-first
application.

Next.js is server-first by design — RSC, streaming, server actions. Building a
genuinely offline app inside it means opting out of most of what it provides and
fighting the framework at every step.

A ~50 KB Vite PWA with a service worker is the right tool, and the separation
buys something else that matters more: **a bad Next.js deploy cannot break the
door.** The kiosk ships on its own cadence, and during a web outage the gym keeps
admitting members.

Shared types come from `packages/contracts`, so the two never drift.

---

## 4. The monorepo trap you have already hit — and the fix

In Vieral, apps loaded `packages/*/dist` while `packages/*/src` had moved on.
Typecheck passed; the running API served old behaviour. That failure mode is
invisible and expensive, and a naive monorepo reproduces it exactly.

**The fix — corrected (D-002).** My first answer here was "export `src`, so
there is no `dist` to go stale." That is right for a bundler-only monorepo and
**wrong here**: NestJS builds with plain `tsc`, and sources outside `rootDir`
fail with TS6059. Trend exports `dist` for a real reason.

Packages therefore export `dist`, and staleness is prevented the correct way:

```jsonc
// packages/core/package.json
{
  "name": "@gymos/core",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "dev": "tsc -p tsconfig.json --watch" }
}
```

Every turbo task that consumes a package declares `dependsOn: ["^build"]`, so
turbo rebuilds dependencies before typechecking, testing or building anything
that imports them. The operational rule that closes the gap:

> **Never run an app without turbo.** `pnpm dev` goes through turbo and rebuilds
> packages first. Running `node apps/api/dist/main.js` by hand after editing
> `packages/*/src` serves stale code, and typecheck will not catch it.

That rule is in `ai-workflow/PROJECT.md`, because it is the exact failure you hit
in Vieral and no config setting prevents it on its own.

```jsonc
// turbo.json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test":      { "dependsOn": ["^typecheck"] },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

---

## 5. Multi-tenancy: the part that must not be got wrong

Every request opens one transaction, sets the tenant, and does all its work
inside it. One helper, used everywhere, no exceptions:

```ts
// apps/api/src/db/tenant.ts
export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.org_id = ${orgId}`)
    return fn(tx)
  })
}
```

Enforced by a NestJS interceptor so a route physically cannot reach the database
outside a tenant scope. `orgId` comes from the session — never from the request
body, never from a header.

**Connect as `gymos_app` (`NOBYPASSRLS`), never the table owner.** Owners bypass
RLS silently; that is how RLS ends up enabled and doing nothing.

> **better-auth caveat, worth an hour before you commit to it:** it generates and
> manages its own schema. Those tables are not tenant-scoped the way yours are.
> Either exclude them from the RLS policy loop in `0001_guards.sql` §1, or map
> better-auth's organization concept onto `organization` deliberately. Prototype
> this before building on it — retrofitting auth is the worst kind of rework.

---

## 6. Queue: Postgres outbox → BullMQ

Both, and the split is not redundancy.

The **outbox must be Postgres**, because a domain event has to be written in the
same transaction as the state change it describes (`automation-engine.md` §2).
Publishing to Redis after commit loses events exactly when the process crashes.

**BullMQ executes.** A relay reads unprocessed `event` rows and enqueues jobs;
BullMQ owns retries, exponential backoff, delayed jobs and repeatable schedules —
all of which you would otherwise hand-write.

```
domain write ─┬─> state change      ┐
              └─> event row         ┘ one transaction
                      │
                 relay (poll, SKIP LOCKED)
                      │
                   BullMQ ──> worker ──> message / risk score / collection
```

**Honest cost:** Redis is a second stateful service on a one-VPS deploy. It earns
its place through job tooling, rate limiting and caching — but if you would
rather run one database, `SKIP LOCKED` polling straight off the `event` table
works and the automation engine is specified against it either way.

Redis holds no source of truth. **Never back it up; never restore it.** Every job
is reconstructible from Postgres.

---

## 7. Frontend notes

- **RTL:** Tailwind v4 emits logical properties (`ms-*`, `pe-*`) by default, so `dir="rtl"` mostly just works. shadcn/ui still needs an audit — check every component with an icon beside text, every drawer, and every input with an affix.
- **Fonts:** self-host **Vazirmatn**. Google Fonts may be unreachable from Iran.
- **`@gymos/core` is the only place money and dates are formatted.** No component calls a date library directly.
- **Next.js 16 `proxy.ts`** replaces middleware — session checks live there.
- **React Compiler** is stable but off by default. Turn it on only after the Desk meets its latency budget; a build-time memoiser is not a fix for a slow query.
- **Kiosk service worker:** cache-first for the shell, IndexedDB for snapshots, and an explicit update prompt. Never auto-reload a kiosk mid-shift.

---

## 8. Deployment

Docker Compose on an in-country VPS. Boring on purpose — `operations.md` covers
alerts, backups and incidents.

```
caddy → apps/web (Next standalone)
      → apps/api (Nest)
        apps/api-worker (same image, worker entrypoint)
        postgres · redis
```

**Not Vercel.** Not a preference — a requirement. Data must be in-country and
the product must work when international routing is throttled. It is also the
answer to the biggest sales objection (`sales-kit.md` §3), and it only works if
it is true.

Multi-stage Docker builds; `next build --turbopack` and Nest's Rspack builder
keep images small. Split Postgres onto its own VPS past ~50 gyms.

---

## 9. Testing

Vitest across the repo. Write tests only where a silent bug is unrecoverable:

1. **The ledger** — every transaction shape, balance to zero, derived arrears. ✅ done
2. **Money conversion + Persian digit input** — a 10× error reaches a member's phone. ✅ done
3. **Jalali boundaries** — Nowruz, 31-day months, Esfand 29/30, Saturday weeks. ✅ done
4. **Offline sync** — duplicate `clientEventId`, out-of-order arrival, clock skew
5. **Idempotency** — every automation and collection key fires exactly once under retry
6. **RLS** — org A cannot read org B. Run it in CI forever

Skip UI tests. Skip coverage targets. Those six are where solo-maintained systems
actually break.

---

## 10. The tradeoff, stated once

This stack is **three deployables plus Redis** against the single Nuxt app
originally proposed. For one person that is more surface to build, deploy, debug
and monitor.

What it buys is real: one API contract serving the Desk, the kiosk, the member
PWA and a Go binary; a kiosk that can be genuinely offline-first because it isn't
inside a server-first framework; and independent deploy cadences, so shipping the
web app cannot break the door.

Given the Go agent and the hard offline requirement, the split is defensible —
**provided you build `apps/api` and `apps/kiosk` first and treat `apps/web` as
the thing that can wait.** The order matters more than the stack.
