/**
 * Integration tests for 0001_guards.sql.
 *
 * These four invariants are the ones that are unrecoverable if they silently
 * stop working — RLS isolation, the ledger balance constraint, append-only
 * enforcement, and derived-balance correctness. Unit tests cannot cover them
 * because they live in the database, not in TypeScript.
 *
 * Skips cleanly when no database is reachable, so `pnpm test` still runs in an
 * environment without Docker. It does NOT skip silently in CI — see the
 * REQUIRE_DB escape hatch.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const OWNER_URL = process.env.DATABASE_URL ?? 'postgres://gymos:gymos@localhost:5433/gymos';
const APP_URL = process.env.DATABASE_APP_URL ?? 'postgres://gymos_app:gymos_app@localhost:5433/gymos';

let owner: postgres.Sql;
let app: postgres.Sql;

/**
 * Probed at MODULE scope, not in beforeAll. `describe` bodies execute during
 * collection — before any hook runs — so `maybe()` would always see `false`
 * if this flag were set in beforeAll. Top-level await is the fix.
 */
const reachable = await (async (): Promise<boolean> => {
  try {
    owner = postgres(OWNER_URL, { max: 1, connect_timeout: 3, onnotice: () => {} });
    await owner`SELECT 1`;
    app = postgres(APP_URL, { max: 1, connect_timeout: 3, onnotice: () => {} });
    await app`SELECT 1`;
    return true;
  } catch (err) {
    if (process.env.REQUIRE_DB === '1') {
      throw new Error(`REQUIRE_DB=1 but no database is reachable: ${String(err)}`);
    }
    return false;
  }
})();

/** Two orgs, so cross-tenant isolation is actually testable. */
let orgA: string;
let orgB: string;
let personA: string;
let receivableA: string;
let revenueA: string;
let locationA: string;

beforeAll(async () => {
  if (!reachable) return;

  orgA = randomUUID();
  orgB = randomUUID();
  personA = randomUUID();
  receivableA = randomUUID();
  revenueA = randomUUID();
  locationA = randomUUID();

  await owner`INSERT INTO organization (id, name) VALUES (${orgA}, ${'GUARD-TEST-A'}), (${orgB}, ${'GUARD-TEST-B'})`;
  await owner`
    INSERT INTO location (id, org_id, name, is_primary)
    VALUES (${locationA}, ${orgA}, 'GUARD-TEST-LOC', true)`;
  await owner`
    INSERT INTO person (id, org_id, first_name, last_name, mobile, search_name)
    VALUES (${personA}, ${orgA}, 'تست', 'الف', '9990000001', 'تست الف')`;
  await owner`
    INSERT INTO ledger_account (id, org_id, kind, person_id)
    VALUES (${receivableA}, ${orgA}, 'member_receivable', ${personA})`;
  await owner`
    INSERT INTO ledger_account (id, org_id, kind) VALUES (${revenueA}, ${orgA}, 'revenue_tuition')`;
});

afterAll(async () => {
  if (!reachable) return;
  await owner.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`DELETE FROM organization WHERE id IN (${orgA}, ${orgB})`;
  });
  await owner.end({ timeout: 5 });
  await app.end({ timeout: 5 });
});

const maybe = () => (reachable ? it : it.skip);

/** Post a balanced transaction as the owner. Returns the transaction id. */
async function postBalanced(amountRial: number): Promise<string> {
  const txId = randomUUID();
  await owner.begin(async (tx) => {
    await tx`
      INSERT INTO ledger_transaction (id, org_id, type, occurred_at, jalali_ym)
      VALUES (${txId}, ${orgA}, 'membership_sale', now(), '1405-07')`;
    await tx`
      INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
      VALUES (${randomUUID()}, ${orgA}, ${txId}, ${receivableA}, 'debit',  ${amountRial}),
             (${randomUUID()}, ${orgA}, ${txId}, ${revenueA},    'credit', ${amountRial})`;
  });
  return txId;
}

describe('RLS tenant isolation', () => {
  maybe()('returns only the current org rows to the application role', async () => {
    const a = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${orgA}, true)`;
      return tx`SELECT count(*)::int AS n FROM person`;
    });
    expect(a[0]!.n).toBeGreaterThan(0);

    const b = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${orgB}, true)`;
      return tx`SELECT count(*)::int AS n FROM person`;
    });
    // Org B has no people — org A's rows must be invisible.
    expect(b[0]!.n).toBe(0);
  });

  maybe()('hides everything when no org is set', async () => {
    const rows = await app`SELECT count(*)::int AS n FROM person`;
    expect(rows[0]!.n).toBe(0);
  });

  maybe()('refuses to write a row belonging to another org', async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`SELECT set_config('app.org_id', ${orgB}, true)`;
        return tx`
          INSERT INTO person (id, org_id, first_name, last_name, mobile, search_name)
          VALUES (${randomUUID()}, ${orgA}, 'x', 'y', '9990000009', 'x y')`;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  maybe()('is not bypassable by the application role', async () => {
    const rows = await app`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]!.rolbypassrls).toBe(false);
  });
});

describe('the ledger balance invariant', () => {
  maybe()('accepts a balanced transaction', async () => {
    await expect(postBalanced(25_000_000)).resolves.toBeTruthy();
  });

  maybe()('rejects an unbalanced transaction at COMMIT', async () => {
    const txId = randomUUID();
    await expect(
      owner.begin(async (tx) => {
        await tx`
          INSERT INTO ledger_transaction (id, org_id, type, occurred_at, jalali_ym)
          VALUES (${txId}, ${orgA}, 'payment', now(), '1405-07')`;
        await tx`
          INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
          VALUES (${randomUUID()}, ${orgA}, ${txId}, ${receivableA}, 'debit',  ${100_000}),
                 (${randomUUID()}, ${orgA}, ${txId}, ${revenueA},    'credit', ${90_000})`;
      }),
    ).rejects.toThrow(/unbalanced by 10000 rial/);
  });

  maybe()('rejects a single-entry transaction', async () => {
    const txId = randomUUID();
    await expect(
      owner.begin(async (tx) => {
        await tx`
          INSERT INTO ledger_transaction (id, org_id, type, occurred_at, jalali_ym)
          VALUES (${txId}, ${orgA}, 'adjustment', now(), '1405-07')`;
        await tx`
          INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
          VALUES (${randomUUID()}, ${orgA}, ${txId}, ${receivableA}, 'debit', ${1_000})`;
      }),
    ).rejects.toThrow(/at least 2 required/);
  });

  maybe()('rejects a non-positive amount — direction carries the sign', async () => {
    const txId = randomUUID();
    await expect(
      owner.begin(async (tx) => {
        await tx`
          INSERT INTO ledger_transaction (id, org_id, type, occurred_at, jalali_ym)
          VALUES (${txId}, ${orgA}, 'adjustment', now(), '1405-07')`;
        await tx`
          INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
          VALUES (${randomUUID()}, ${orgA}, ${txId}, ${receivableA}, 'debit', ${-5})`;
      }),
    ).rejects.toThrow(/ledger_entry_amount_positive/);
  });
});

describe('append-only enforcement', () => {
  maybe()('rejects UPDATE on ledger_entry', async () => {
    await postBalanced(7_000);
    await expect(
      owner`UPDATE ledger_entry SET amount_rial = 1 WHERE org_id = ${orgA}`,
    ).rejects.toThrow(/append-only/);
  });

  maybe()('rejects DELETE on ledger_entry', async () => {
    await expect(owner`DELETE FROM ledger_entry WHERE org_id = ${orgA}`).rejects.toThrow(
      /append-only/,
    );
  });

  maybe()('rejects UPDATE on check_in', async () => {
    await owner`
      INSERT INTO check_in (id, org_id, person_id, location_id, method, occurred_at, client_event_id, jalali_ym)
      VALUES (${randomUUID()}, ${orgA}, ${personA}, ${locationA}, 'qr', now(), ${`guard-${randomUUID()}`}, '1405-07')`;
    await expect(
      owner`UPDATE check_in SET admitted = false WHERE org_id = ${orgA}`,
    ).rejects.toThrow(/append-only/);
  });
});

describe('derived balances', () => {
  maybe()('v_member_arrears reflects posted entries without a stored column', async () => {
    // Fresh account so the total is exactly what we post.
    const person = randomUUID();
    const recv = randomUUID();
    await owner`
      INSERT INTO person (id, org_id, first_name, last_name, mobile, search_name)
      VALUES (${person}, ${orgA}, 'بدهکار', 'تست', '9990000002', 'بدهکار تست')`;
    await owner`
      INSERT INTO ledger_account (id, org_id, kind, person_id)
      VALUES (${recv}, ${orgA}, 'member_receivable', ${person})`;

    const sale = randomUUID();
    await owner.begin(async (tx) => {
      await tx`
        INSERT INTO ledger_transaction (id, org_id, type, occurred_at, jalali_ym)
        VALUES (${sale}, ${orgA}, 'membership_sale', now(), '1405-07')`;
      await tx`
        INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
        VALUES (${randomUUID()}, ${orgA}, ${sale}, ${recv},     'debit',  ${25_000_000}),
               (${randomUUID()}, ${orgA}, ${sale}, ${revenueA}, 'credit', ${25_000_000})`;
    });

    const pay = randomUUID();
    await owner.begin(async (tx) => {
      await tx`
        INSERT INTO ledger_transaction (id, org_id, type, occurred_at, jalali_ym)
        VALUES (${pay}, ${orgA}, 'payment', now(), '1405-07')`;
      await tx`
        INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
        VALUES (${randomUUID()}, ${orgA}, ${pay}, ${revenueA}, 'debit',  ${15_000_000}),
               (${randomUUID()}, ${orgA}, ${pay}, ${recv},     'credit', ${15_000_000})`;
    });

    const rows = await owner`
      SELECT arrears_rial::text FROM v_member_arrears WHERE person_id = ${person}`;
    // 25,000,000 sold − 15,000,000 paid = 10,000,000 Rial = 1,000,000 Toman
    expect(rows[0]!.arrears_rial).toBe('10000000');
  });

  maybe()('the seeded book sums to exactly zero', async () => {
    const rows = await owner`
      SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_rial ELSE -amount_rial END), 0)::text AS imbalance
        FROM ledger_entry`;
    expect(rows[0]!.imbalance).toBe('0');
  });
});
