# TASK-002 — Monorepo foundation

| Field | Value |
|-------|-------|
| **Task ID** | TASK-002 |
| **Title** | Monorepo foundation |
| **Status** | `review` |
| **Current agent / owner** | Claude Code |
| **Role** | implementer |

## Goal

pnpm + turbo workspace that builds, typechecks and tests cleanly, with config loading and local datastores.

## Acceptance criteria

- [x] `tsconfig.base.json`, eslint flat config, prettier (`printWidth: 100`)
- [x] `packages/config` — zod-validated env, `getConfig()`, `.env` walker
- [x] `docker-compose.yml` — postgres 17 (5433), redis 7 (6380), healthchecks
- [x] `.env.example` matches the schema exactly
- [x] `packages/core` migrated to `dist` exports (D-002) and still 94/94 green
- [x] `pnpm typecheck && pnpm test` pass at root

## Relevant documentation

- [PROJECT.md](../PROJECT.md) · [WORKFLOW.md](../WORKFLOW.md) · [DECISIONS.md](../DECISIONS.md)
- [`design/tech-stack.md`](../../design/tech-stack.md)

## Out of scope

No API, no DB schema. No CI pipeline yet.

## Implementation plan

1. Root tsconfig/eslint/prettier, turbo task graph
2. `packages/config` mirroring Trend's flat zod schema + `loadDotEnv`
3. docker-compose + `.env.example`
4. Convert `packages/core` to dist exports; correct `design/tech-stack.md` §4 per D-002

## Files changed

| Path | Change |
|------|--------|
| `tsconfig.base.json` | NodeNext, strict, Trend-aligned options |
| `eslint.config.mjs`, `.prettierrc` | flat config, printWidth 100 |
| `docker-compose.yml` | postgres 17 (5433), redis 7 (6380), healthchecks |
| `.env.example` | matches the zod schema exactly |
| `packages/config/**` | `@gymos/config` — loadDotEnv, envSchema, getConfig, 6 tests |
| `packages/core/package.json` | converted to `dist` exports (D-002) |
| `turbo.json`, `package.json` | task graph with `dependsOn: ["^build"]` |
| `design/tech-stack.md` | §4 corrected: `src` exports break NestJS tsc |

## Commands and tests executed

```bash
pnpm install
pnpm build      # 3 packages ok
pnpm typecheck  # 5 tasks ok
pnpm test       # config 6, core 94
```

## Decisions and assumptions

- **D-002** packages export `dist`; the `src`-export advice in `design/tech-stack.md` was wrong for a NestJS tsc build (TS6059) and has been corrected in place.
- **D-006** shifted host ports 5433/6380.
- `@types/node` is required in any package touching `process`.

## Unresolved issues

- None.

## Review findings

- …

## Handoff notes

- **From → To:** implementer → implementer (TASK-003)
- **Done:** workspace builds, typechecks and tests clean
- **Next:** TASK-003 database package
- **Risks:** none

## Definition-of-done checklist

- [x] Acceptance criteria met
- [x] Relevant validation run (`lint` / `typecheck` / `test` / `build`)
- [x] Files changed listed
- [x] Decisions/assumptions recorded
- [ ] Review complete or explicitly waived
- [x] Handoff notes updated
