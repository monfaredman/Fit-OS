/**
 * Writes a `@gymos/core` Transaction to the database.
 *
 * Every posting goes through here, and every posting is asserted balanced in
 * TypeScript *before* the database sees it. The deferred constraint trigger in
 * 0001_guards.sql is the authority; this exists so the failure is a readable
 * error at the call site rather than a Postgres exception at COMMIT, by which
 * point the offending entries are three stack frames away.
 */

import { assertBalanced, jalaliYm, type Transaction } from '@gymos/core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from './tenant.db.js';

export interface PostOptions {
  orgId: string;
  occurredAt?: Date;
  memo?: string;
  refTable?: string;
  refId?: string;
  createdByStaffId?: string;
}

/** Posts the transaction and returns its id. Must run inside `withOrg`. */
export async function postTransaction(
  tx: Tx,
  transaction: Transaction,
  opts: PostOptions,
): Promise<string> {
  assertBalanced(transaction);

  const id = randomUUID();
  // A raw `sql` template passes values straight to postgres.js, which does not
  // accept a JS Date here — serialise explicitly. Drizzle's query builder does
  // this for you; `execute` does not.
  const occurredAt = opts.occurredAt ?? new Date();

  await tx.execute(sql`
    INSERT INTO ledger_transaction
      (id, org_id, type, ref_table, ref_id, memo, occurred_at, jalali_ym, created_by_staff_id)
    VALUES (${id}, ${opts.orgId}, ${transaction.type}, ${opts.refTable ?? null},
            ${opts.refId ?? null}, ${opts.memo ?? null}, ${occurredAt.toISOString()},
            ${jalaliYm(occurredAt)}, ${opts.createdByStaffId ?? null})
  `);

  for (const e of transaction.entries) {
    await tx.execute(sql`
      INSERT INTO ledger_entry (id, org_id, transaction_id, account_id, direction, amount_rial)
      VALUES (${randomUUID()}, ${opts.orgId}, ${id}, ${e.accountId}, ${e.direction}, ${e.amountRial})
    `);
  }

  return id;
}

/** Current balance of one account, derived — never a stored column. */
export async function accountBalance(tx: Tx, accountId: string): Promise<number> {
  const rows = await tx.execute<{ balance: string }>(sql`
    SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_rial ELSE -amount_rial END), 0)::text
             AS balance
      FROM ledger_entry WHERE account_id = ${accountId}
  `);
  return Number((rows as unknown as { balance: string }[])[0]?.balance ?? 0);
}
