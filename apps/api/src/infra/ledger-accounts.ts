/**
 * Ledger account resolution.
 *
 * Accounts are created lazily and idempotently: `ON CONFLICT DO NOTHING` against
 * the unique index means two concurrent sales for the same member cannot create
 * two receivable accounts, which would split their arrears in half and be
 * almost impossible to notice.
 */

import { sql } from 'drizzle-orm';
import type { Tx } from './tenant.db.js';

export type OrgAccountKind =
  | 'revenue_tuition'
  | 'revenue_retail'
  | 'revenue_locker'
  | 'discount'
  | 'refund'
  | 'opening_balance'
  | 'psp_fee'
  | 'bank';

export type MemberAccountKind = 'member_receivable' | 'member_wallet';

async function ensure(
  tx: Tx,
  orgId: string,
  kind: string,
  personId: string | null,
  locationId: string | null,
): Promise<string> {
  // The unique index is (org_id, person_id, kind); person_id is NULL for org
  // accounts, and NULL is not equal to itself in a unique index, so org
  // accounts are matched by an explicit SELECT first.
  const found = await tx.execute<{ id: string }>(sql`
    SELECT id FROM ledger_account
     WHERE org_id = ${orgId} AND kind = ${kind}
       AND person_id IS NOT DISTINCT FROM ${personId}
     LIMIT 1
  `);
  const existing = (found as unknown as { id: string }[])[0];
  if (existing) return existing.id;

  const inserted = await tx.execute<{ id: string }>(sql`
    INSERT INTO ledger_account (org_id, kind, person_id, location_id)
    VALUES (${orgId}, ${kind}, ${personId}, ${locationId})
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const row = (inserted as unknown as { id: string }[])[0];
  if (row) return row.id;

  // Lost the race — the other transaction created it.
  const retry = await tx.execute<{ id: string }>(sql`
    SELECT id FROM ledger_account
     WHERE org_id = ${orgId} AND kind = ${kind}
       AND person_id IS NOT DISTINCT FROM ${personId}
     LIMIT 1
  `);
  const won = (retry as unknown as { id: string }[])[0];
  if (!won) throw new Error(`could not resolve ledger account ${kind}`);
  return won.id;
}

export function memberAccount(
  tx: Tx,
  orgId: string,
  personId: string,
  kind: MemberAccountKind,
): Promise<string> {
  return ensure(tx, orgId, kind, personId, null);
}

export function orgAccount(tx: Tx, orgId: string, kind: OrgAccountKind): Promise<string> {
  return ensure(tx, orgId, kind, null, null);
}

/** The cash drawer is per location, not per org. */
export function drawerAccount(tx: Tx, orgId: string, locationId: string): Promise<string> {
  return ensure(tx, orgId, 'cash_drawer', null, locationId);
}
