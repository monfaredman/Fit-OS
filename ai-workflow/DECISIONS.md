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
| **D-008** | ~~Deleting an organization uses `session_replication_role = replica`~~ **SUPERSEDED by D-009** | Correct problem, wrong tool — see D-009 | TASK-003 |
| **D-009** | Deleting an organization suspends **only user triggers**: `ALTER TABLE <t> DISABLE TRIGGER USER` on the five append-only tables, inside a transaction | `session_replication_role = replica` disables *system* triggers too — which is how Postgres implements foreign keys. The parent row is deleted and every child is silently orphaned. Caught when login found four staff rows for one mobile, belonging to three organizations that no longer existed. `DISABLE TRIGGER USER` leaves FK cascades intact; ALTER TABLE is transactional so a failure rolls the suspension back | TASK-005 |
| **D-010** | Auth bootstrap uses two `SECURITY DEFINER` functions (`auth_resolve_session`, `auth_staff_by_mobile`) rather than loosening RLS or connecting as the owner | `gymos_app` is NOBYPASSRLS, so the untenanted lookups login needs match nothing. Loosening the policy weakens the guarantee everything rests on; connecting as owner bypasses every policy. Definer functions expose exactly two narrow lookups, pin `search_path` (mandatory — otherwise a caller can shadow `session`/`staff` and hijack the definer's privileges), and are granted to `gymos_app` alone. **These are the only RLS bypass in the system; changing them is a security review** | TASK-005 |

