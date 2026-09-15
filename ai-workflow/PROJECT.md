# GymOS — Project rules for agents

Gym management SaaS for the Iranian market. Solo-maintained. **Production system
handling real money.** Persian/RTL, Solar Hijri, offline-tolerant front desk.

Strategy: [gymos-iran-teardown.html](../gymos-iran-teardown.html) — verdict
**GO with changes**. The wedge is *collecting money gyms are already owed*, not AI.

## Source-of-truth order

1. Current code and configuration
2. [`.env.example`](../.env.example) and root [`package.json`](../package.json) scripts
3. [DECISIONS.md](DECISIONS.md)
4. [`design/`](../design/) · [`product/`](../product/) · [`ai/`](../ai/)
5. The strategy teardown

Do not invent ports, commands, APIs, or status. Mark unknowns as **VERIFY**.

## Monorepo map

pnpm workspace + Turborepo. Package names: `@gymos/<name>`.

```
apps/api          NestJS 11 + Fastify (REST, Swagger /docs)
apps/web          Next.js 16 (Desk, owner, member portal)      [scaffold]
packages/core     money · jalali · ledger — framework-free, 94 tests
packages/db       Drizzle schema · migrations · guards · seed
packages/contracts Zod schemas + error catalogue, shared api ↔ web
packages/config   env loading + zod validation
```

Deferred, not missing: `apps/kiosk` (Vite PWA — [`design/offline-sync.md`](../design/offline-sync.md)),
`agent/` (Go bridge — [`design/hardware-bridge.md`](../design/hardware-bridge.md)),
automation engine + BullMQ ([`design/automation-engine.md`](../design/automation-engine.md)).

## The eight invariants

Full text in [`../CLAUDE.md`](../CLAUDE.md). Four are unrecoverable if violated
silently — money is integer Rial, balances are never stored, facts are
append-only, every tenant query goes through `withOrg`. Touching any of them
without a test is a review rejection.

## Setup and commands

Prereqs: Node >= 20, pnpm 9, Docker Desktop.

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis     # wait until healthy
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Root scripts: `pnpm build|dev|lint|typecheck|test`, `pnpm db:generate|db:migrate|db:seed`,
`pnpm format`, `pnpm clean`.

Filter packages with **`pnpm --filter @gymos/<pkg>`** — never `npm --filter`.

**Never run an app directly without turbo.** Workspace packages emit `dist/` and
`turbo` enforces `dependsOn: ["^build"]`. Running `node apps/api/dist/main.js`
after editing `packages/*/src` serves stale code and typecheck will not catch it
(D-002).

Validation after changes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Services and ports

| Service | Port | Source |
|---------|------|--------|
| API | `PORT` default **3000**; Swagger `/docs` | `.env.example` |
| Web | **3001** | `apps/web` |
| Postgres | host **5433** → container 5432 | `docker-compose.yml` |
| Redis | host **6380** → container 6379 | `docker-compose.yml` |

Shifted host ports avoid clashes with a local Homebrew Postgres/Redis.

## Database rules

- Migrations: `packages/db/drizzle/NNNN_snake_name.sql` + `drizzle/meta/_journal.json`.
  `drizzle-kit generate` **is** allowed here — snapshots are clean (D-005). Keep
  them that way; if they ever drift, switch to hand-written SQL in the same format.
- `0001_guards.sql` is **hand-written and permanent**: RLS policies, the ledger
  balance constraint trigger, append-only triggers. `generate` must never
  overwrite it.
- The app connects as **`gymos_app`** (`NOBYPASSRLS`). Never as the table owner —
  owners bypass RLS silently, which is how RLS ends up enabled and doing nothing.

## Persian / locale rules

- Money stored integer **Rial**, displayed **Toman** (÷10). Never store Toman.
- Every numeric input accepts **Persian and Latin digits** (`normalizeDigits`).
- Every name search normalises `ي→ی`, `ك→ک` (`normalizePersianText`).
- Dates Jalali everywhere in the UI; **week starts Saturday**.
- One Persian term per concept — [`product/glossary.md`](../product/glossary.md).
- Never show a Rial figure or a Gregorian date to a user.

## Known open question

**D-001 — member identity.** `person(org_id, mobile)` is unique. If gym visits
show families sharing one number, the replacement migration is already written in
[`design/0001_guards.sql`](../design/0001_guards.sql) §5. Treat as reversible,
not settled.
