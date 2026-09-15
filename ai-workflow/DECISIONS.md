# Decisions — GymOS

Architectural decisions and recorded assumptions. Append; never rewrite history.

| ID | Decision | Rationale | Task |
|----|----------|-----------|------|
| **D-001** | `person(org_id, mobile)` is unique — one person per mobile per gym | Mobile is the de-facto identity key in Iran. **Reversible**: if gym visits show families sharing a number, the replacement partial-unique-index migration is pre-written in `design/0001_guards.sql` §5 | TASK-003 |
| **D-002** | Workspace packages export `dist`, not `src`; staleness prevented by turbo `dependsOn: ["^build"]` and always running through turbo | `src` exports break NestJS's plain `tsc` build (TS6059, sources outside `rootDir`). Supersedes the `src`-export recommendation in `design/tech-stack.md` §4 | TASK-002 |
| **D-003** | Domain events go to a Postgres outbox written in the same transaction as the state change; BullMQ only executes | Publishing after commit loses events exactly when the process crashes. `design/automation-engine.md` §2 | deferred |
| **D-004** | One transaction per request; `SET LOCAL app.org_id` via a Nest interceptor; app connects as `gymos_app` (`NOBYPASSRLS`) | Defence in depth. Application-level org filtering alone is one forgotten `where` from a cross-tenant leak | TASK-004 |
| **D-005** | `drizzle-kit generate` is permitted in this repo | Snapshots start clean, unlike Trend where meta stops at 0009. `0001_guards.sql` stays hand-written and must never be regenerated | TASK-003 |
| **D-006** | Postgres 17 and Redis 7 on shifted host ports 5433 / 6380 | Avoids clashing with a local Homebrew install, matching the Trend convention | TASK-002 |
| **D-007** | Enum-ish columns are `text` + an app-layer Zod enum, not `pgEnum` | Adding a value to a pgEnum is a migration ordeal for no real safety gain; matches the Trend convention | TASK-003 |
| **D-008** | Deleting an organization requires suspending triggers (`SET LOCAL session_replication_role = replica`) inside a transaction | The append-only triggers reject cascade DELETEs on `check_in` / `ledger_entry` / `audit_log` — by design. Only the owner connection can do this; `gymos_app` cannot, so the API can never delete history | TASK-003 |

