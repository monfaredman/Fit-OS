import { Injectable } from '@nestjs/common';
import {
  AppError,
  type ArrearsQuery,
  type ArrearsSummaryDto,
  type CreatePaymentBody,
  type WalletTopUpBody,
} from '@gymos/contracts';
import { jalaliYm, recordPayment, walletTopUp } from '@gymos/core';
import { payment as paymentTable } from '@gymos/db';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AccessSnapshotService } from '../access/access-snapshot.service.js';
import type { AuthUser } from '../auth/staff-auth.guard.js';
import { drawerAccount, memberAccount, orgAccount } from '../infra/ledger-accounts.js';
import { accountBalance, postTransaction } from '../infra/ledger-post.js';
import { TenantDb, type Tx } from '../infra/tenant.db.js';
import { computeVariance, describeVariance } from './drawer.js';
import { decideReplay, expiresAt, hashRequest, type StoredResponse } from './idempotency.js';

@Injectable()
export class MoneyService {
  constructor(
    private readonly db: TenantDb,
    private readonly snapshots: AccessSnapshotService,
  ) {}

  /**
   * Run `work` exactly once per (org, key). The store read, the work and the
   * store write all happen in one transaction, so a crash mid-flight leaves
   * neither a half-posted ledger nor a key claiming success.
   */
  private async once<T>(
    user: AuthUser,
    key: string,
    body: unknown,
    status: number,
    work: (tx: Tx) => Promise<T>,
  ): Promise<{ result: T; replayed: boolean }> {
    const incomingHash = hashRequest(body);

    return this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.execute<StoredResponse>(sql`
        SELECT request_hash AS "requestHash", response_status AS "responseStatus",
               response_body AS "responseBody"
          FROM idempotency_key
         WHERE org_id = ${user.orgId} AND key = ${key} AND expires_at > now()
         LIMIT 1
      `);
      const stored = (rows as unknown as StoredResponse[])[0] ?? null;

      const decision = decideReplay(stored, incomingHash);
      if (decision.kind === 'conflict') throw new AppError('IDEMPOTENCY_KEY_REUSED');
      if (decision.kind === 'replay') {
        return { result: decision.body as T, replayed: true };
      }

      const result = await work(tx);

      await tx.execute(sql`
        INSERT INTO idempotency_key
          (org_id, key, request_hash, response_status, response_body, expires_at)
        VALUES (${user.orgId}, ${key}, ${incomingHash}, ${status},
                ${JSON.stringify(result)}::jsonb, ${expiresAt().toISOString()})
        ON CONFLICT (org_id, key) DO NOTHING
      `);

      return { result, replayed: false };
    });
  }

  /** Receive money against what a member owes. */
  async takePayment(
    user: AuthUser,
    key: string,
    body: CreatePaymentBody,
  ): Promise<{ result: { id: string; arrearsRial: number }; replayed: boolean }> {
    return this.once(user, key, body, 201, async (tx) => {
      const receivable = await memberAccount(tx, user.orgId, body.personId, 'member_receivable');

      const into =
        body.method === 'wallet'
          ? await memberAccount(tx, user.orgId, body.personId, 'member_wallet')
          : body.method === 'direct_debit' || body.method === 'gateway'
            ? await orgAccount(tx, user.orgId, 'bank')
            : await drawerAccount(tx, user.orgId, await this.primaryLocation(tx, user.orgId));

      if (body.method === 'wallet') {
        // Spending from the wallet reduces a liability; it cannot go negative.
        const walletRaw = await accountBalance(tx, into);
        const available = -walletRaw;
        if (available < body.amountRial) {
          throw new AppError('INSUFFICIENT_WALLET_BALANCE', {
            availableRial: Math.max(0, available),
            requiredRial: body.amountRial,
          });
        }
      }

      const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
      const txId = await postTransaction(
        tx,
        recordPayment({
          intoAccountId: into,
          receivableId: receivable,
          amountRial: body.amountRial,
        }),
        {
          orgId: user.orgId,
          occurredAt: receivedAt,
          createdByStaffId: user.staffId,
        },
      );

      const id = randomUUID();
      await tx.insert(paymentTable).values({
        id,
        orgId: user.orgId,
        personId: body.personId,
        method: body.method,
        amountRial: body.amountRial,
        receivedAt,
        reference: body.reference ?? null,
        receivedByStaffId: user.staffId,
        transactionId: txId,
      });

      // Paying down arrears can change the door decision (policy `block`).
      await this.snapshots.recompute(tx, user.orgId, body.personId);

      return { id, arrearsRial: await accountBalance(tx, receivable) };
    });
  }

  /** Member prepays into their wallet. The gym's liability increases. */
  async topUpWallet(
    user: AuthUser,
    key: string,
    body: WalletTopUpBody,
  ): Promise<{ result: { walletRial: number }; replayed: boolean }> {
    return this.once(user, key, body, 201, async (tx) => {
      const wallet = await memberAccount(tx, user.orgId, body.personId, 'member_wallet');
      const into =
        body.method === 'gateway' || body.method === 'direct_debit'
          ? await orgAccount(tx, user.orgId, 'bank')
          : await drawerAccount(tx, user.orgId, await this.primaryLocation(tx, user.orgId));

      await postTransaction(
        tx,
        walletTopUp({ intoAccountId: into, walletId: wallet, amountRial: body.amountRial }),
        { orgId: user.orgId, createdByStaffId: user.staffId },
      );

      return { walletRial: -(await accountBalance(tx, wallet)) };
    });
  }

  /** A member's money history, newest first. */
  async ledger(user: AuthUser, personId: string, limit = 50) {
    return this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT lt.id, lt.type, lt.occurred_at AS "occurredAt", lt.jalali_ym AS "jalaliYm",
               la.kind AS "accountKind", le.direction, le.amount_rial::text AS "amountRial"
          FROM ledger_entry le
          JOIN ledger_account la ON la.id = le.account_id
          JOIN ledger_transaction lt ON lt.id = le.transaction_id
         WHERE la.person_id = ${personId}
         ORDER BY lt.occurred_at DESC
         LIMIT ${limit}
      `);
      return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        transactionId: r.id as string,
        type: r.type as string,
        occurredAt: new Date(r.occurredAt as string).toISOString(),
        jalaliYm: r.jalaliYm as string,
        accountKind: r.accountKind as string,
        direction: r.direction as string,
        amountRial: Number(r.amountRial),
      }));
    });
  }

  /**
   * The arrears screen — the query behind every sales conversation.
   * Cursor, not offset: rows shift constantly under a busy desk.
   */
  async arrears(user: AuthUser, query: ArrearsQuery): Promise<ArrearsSummaryDto> {
    return this.db.withOrg(user.orgId, async (tx) => {
      const totals = await tx.execute<{ total: string; members: string }>(sql`
        SELECT COALESCE(SUM(arrears_rial), 0)::text AS total, COUNT(*)::text AS members
          FROM v_member_arrears
         WHERE arrears_rial >= ${query.minRial}
           AND (${query.agedOverDays} = 0
                OR oldest_debit_at <= now() - (${query.agedOverDays} || ' days')::interval)
      `);
      const t = (totals as unknown as { total: string; members: string }[])[0]!;

      const rows = await tx.execute(sql`
        SELECT person_id AS "personId", first_name AS "firstName", last_name AS "lastName",
               mobile, arrears_rial::text AS "arrearsRial", oldest_debit_at AS "oldestDebitAt"
          FROM v_member_arrears
         WHERE arrears_rial >= ${query.minRial}
           AND (${query.agedOverDays} = 0
                OR oldest_debit_at <= now() - (${query.agedOverDays} || ' days')::interval)
           AND (${query.cursor ?? null}::text IS NULL
                OR arrears_rial < (${query.cursor ?? '0'})::bigint)
         ORDER BY arrears_rial DESC
         LIMIT ${query.limit}
      `);

      const list = (rows as unknown as Record<string, unknown>[]).map((r) => {
        const oldest = r.oldestDebitAt as string | null;
        return {
          personId: r.personId as string,
          firstName: r.firstName as string,
          lastName: r.lastName as string,
          mobile: r.mobile as string,
          arrearsRial: Number(r.arrearsRial),
          ageDays: oldest
            ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000)
            : null,
        };
      });

      return {
        totalRial: Number(t.total),
        memberCount: Number(t.members),
        rows: list,
        nextCursor:
          list.length === query.limit ? String(list[list.length - 1]!.arrearsRial) : null,
      };
    });
  }

  /**
   * The open shift: cash movements since the last close.
   *
   * Expected is derived from the ledger, never stored and never supplied by the
   * person being measured — that is the whole control (design/permissions.md §2).
   */
  async drawerCurrent(user: AuthUser) {
    return this.db.withOrg(user.orgId, async (tx) => {
      const locationId = await this.primaryLocation(tx, user.orgId);
      const since = await this.lastCloseAt(tx, user.orgId, locationId);
      const expectedRial = await this.expectedCash(tx, user.orgId, locationId, since);
      return {
        locationId,
        periodFrom: since.toISOString(),
        expectedRial,
        lastCloseAt: since.toISOString(),
      };
    });
  }

  /** Records the count. Append-only: a close is evidence, so it is never edited. */
  async drawerClose(user: AuthUser, countedRial: number, note?: string) {
    return this.db.withOrg(user.orgId, async (tx) => {
      const locationId = await this.primaryLocation(tx, user.orgId);
      const periodFrom = await this.lastCloseAt(tx, user.orgId, locationId);
      const expectedRial = await this.expectedCash(tx, user.orgId, locationId, periodFrom);
      const variance = computeVariance({ expectedRial, countedRial });
      const periodTo = new Date();

      const rows = await tx.execute<{ id: string }>(sql`
        INSERT INTO drawer_close
          (org_id, location_id, staff_id, period_from, period_to,
           expected_rial, counted_rial, variance_rial, note, jalali_ym)
        VALUES (${user.orgId}, ${locationId}, ${user.staffId},
                ${periodFrom.toISOString()}, ${periodTo.toISOString()},
                ${expectedRial}, ${countedRial}, ${variance.varianceRial},
                ${note ?? null}, ${jalaliYm(periodTo)})
        RETURNING id
      `);

      return {
        id: (rows as unknown as { id: string }[])[0]!.id,
        periodFrom: periodFrom.toISOString(),
        periodTo: periodTo.toISOString(),
        expectedRial,
        countedRial,
        ...variance,
        message: describeVariance(variance),
      };
    });
  }

  /** Recent closes. Owner-visible, which is what makes the control real. */
  async drawerHistory(user: AuthUser, limit = 30) {
    return this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT d.id, d.period_from AS "periodFrom", d.period_to AS "periodTo",
               d.expected_rial::text AS "expectedRial", d.counted_rial::text AS "countedRial",
               d.variance_rial::text AS "varianceRial", d.note,
               s.first_name AS "firstName", s.last_name AS "lastName"
          FROM drawer_close d LEFT JOIN staff s ON s.id = d.staff_id
         ORDER BY d.period_to DESC LIMIT ${limit}
      `);
      return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        periodFrom: new Date(r.periodFrom as string).toISOString(),
        periodTo: new Date(r.periodTo as string).toISOString(),
        expectedRial: Number(r.expectedRial),
        countedRial: Number(r.countedRial),
        varianceRial: Number(r.varianceRial),
        note: (r.note as string | null) ?? null,
        staff: r.firstName ? `${r.firstName} ${r.lastName}` : null,
      }));
    });
  }

  private async lastCloseAt(tx: Tx, orgId: string, locationId: string): Promise<Date> {
    const rows = await tx.execute<{ periodTo: string }>(sql`
      SELECT period_to AS "periodTo" FROM drawer_close
       WHERE org_id = ${orgId} AND location_id = ${locationId}
       ORDER BY period_to DESC LIMIT 1
    `);
    const last = (rows as unknown as { periodTo: string }[])[0];
    // No close yet: the shift starts at midnight today, Tehran.
    return last ? new Date(last.periodTo) : new Date(new Date().setHours(0, 0, 0, 0));
  }

  private async expectedCash(
    tx: Tx,
    orgId: string,
    locationId: string,
    since: Date,
  ): Promise<number> {
    const rows = await tx.execute<{ expected: string }>(sql`
      SELECT COALESCE(SUM(CASE WHEN le.direction = 'debit' THEN le.amount_rial
                               ELSE -le.amount_rial END), 0)::text AS expected
        FROM ledger_entry le
        JOIN ledger_account la ON la.id = le.account_id
        JOIN ledger_transaction lt ON lt.id = le.transaction_id
       WHERE la.kind = 'cash_drawer' AND la.location_id = ${locationId}
         AND la.org_id = ${orgId} AND lt.occurred_at > ${since.toISOString()}
    `);
    return Number((rows as unknown as { expected: string }[])[0]?.expected ?? 0);
  }

  private async primaryLocation(tx: Tx, orgId: string): Promise<string> {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM location WHERE org_id = ${orgId} AND deleted_at IS NULL
       ORDER BY is_primary DESC, created_at LIMIT 1
    `);
    const id = (rows as unknown as { id: string }[])[0]?.id;
    if (!id) throw new AppError('NO_TENANT');
    return id;
  }
}
