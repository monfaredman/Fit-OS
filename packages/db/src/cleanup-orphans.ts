/**
 * One-off repair for databases seeded before D-009.
 *
 * The old wipe used `session_replication_role = replica`, which disables
 * *system* triggers — Postgres implements foreign keys as system triggers — so
 * deleting an organization left every child row behind. The seed is fixed; this
 * removes the residue.
 *
 * Safe to run repeatedly. Reports what it removed and asserts the ledger still
 * balances afterwards.
 */

import { loadConfig } from '@gymos/config';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';

/** Child-first, so foreign keys never block a delete. */
const TABLES = [
  'ledger_entry', 'ledger_transaction', 'check_in', 'access_snapshot', 'payment',
  'membership_freeze', 'membership', 'ledger_account', 'risk_score', 'person',
  'plan', 'locker_assignment', 'locker', 'product', 'stock_movement',
  'automation_run', 'automation', 'message', 'sms_credit_ledger', 'drawer_close',
  'scheduled_trigger', 'event', 'session', 'staff', 'audit_log', 'location',
] as const;

const APPEND_ONLY = [
  'ledger_entry', 'check_in', 'stock_movement', 'sms_credit_ledger', 'audit_log',
  'drawer_close',
] as const;

async function main(): Promise<void> {
  const { db, close } = createDb(loadConfig().DATABASE_URL);
  try {
    let removed = 0;
    await db.transaction(async (tx) => {
      for (const t of APPEND_ONLY) {
        await tx.execute(sql.raw(`ALTER TABLE ${t} DISABLE TRIGGER USER`));
      }
      for (const t of TABLES) {
        // NOT EXISTS rather than NOT IN: the latter behaves badly under RLS and
        // silently deletes nothing.
        const res = await tx.execute(
          sql.raw(
            `DELETE FROM ${t} x WHERE NOT EXISTS (SELECT 1 FROM organization o WHERE o.id = x.org_id)`,
          ),
        );
        const n = (res as unknown as { count?: number }).count ?? 0;
        if (n > 0) {
          console.log(`  ${t}: ${n}`);
          removed += n;
        }
      }
      for (const t of APPEND_ONLY) {
        await tx.execute(sql.raw(`ALTER TABLE ${t} ENABLE TRIGGER USER`));
      }
    });

    const rows = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_rial ELSE -amount_rial END), 0)::text AS imbalance
        FROM ledger_entry`);
    const imbalance = Number((rows[0] as { imbalance: string }).imbalance);
    if (imbalance !== 0) throw new Error(`ledger unbalanced after cleanup: ${imbalance} rial`);

    console.log(removed === 0 ? 'No orphaned rows.' : `Removed ${removed} orphaned rows.`);
    console.log('Ledger balanced ✓');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
