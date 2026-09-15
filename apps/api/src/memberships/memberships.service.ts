import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AppError,
  type CreateMembershipBody,
  type FreezeMembershipBody,
  type PlanDto,
  type UnfreezeMembershipBody,
} from '@gymos/contracts';
import { jalaliYm, membershipSale } from '@gymos/core';
import { membership as m, membershipFreeze as mf, plan as planTable } from '@gymos/db';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { discountCapPct } from '../auth/permissions.js';
import type { AuthUser } from '../auth/staff-auth.guard.js';
import { AccessSnapshotService } from '../access/access-snapshot.service.js';
import { memberAccount, orgAccount } from '../infra/ledger-accounts.js';
import { postTransaction } from '../infra/ledger-post.js';
import { TenantDb } from '../infra/tenant.db.js';
import {
  computeEndsAt,
  extendForFreeze,
  freezeDaysCredited,
  renewalStart,
  type PlanKind,
} from './membership-rules.js';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly db: TenantDb,
    private readonly snapshots: AccessSnapshotService,
  ) {}

  async listPlans(user: AuthUser): Promise<PlanDto[]> {
    return this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx
        .select({
          id: planTable.id,
          name: planTable.name,
          kind: planTable.kind,
          durationDays: planTable.durationDays,
          sessionCount: planTable.sessionCount,
          priceRial: planTable.priceRial,
          discipline: planTable.discipline,
        })
        .from(planTable)
        .where(eq(planTable.isActive, true));
      return rows as PlanDto[];
    });
  }

  /**
   * Sell a membership. Revenue is recognised gross with the discount on its own
   * account, so "how much did we discount this month, and who granted it" stays
   * answerable — that is the fraud signal in design/permissions.md §2.
   */
  async sell(user: AuthUser, body: CreateMembershipBody): Promise<{ id: string }> {
    const membershipId = randomUUID();

    await this.db.withOrg(user.orgId, async (tx) => {
      const planRows = await tx.select().from(planTable).where(eq(planTable.id, body.planId)).limit(1);
      const plan = planRows[0];
      if (!plan) throw new NotFoundException();

      const orgRows = await tx.execute<{ discountMaxPct: number; locationId: string }>(sql`
        SELECT o.discount_max_pct AS "discountMaxPct",
               (SELECT id FROM location WHERE org_id = ${user.orgId} ORDER BY is_primary DESC LIMIT 1)
                 AS "locationId"
          FROM organization o WHERE o.id = ${user.orgId}
      `);
      const org = (orgRows as unknown as { discountMaxPct: number; locationId: string }[])[0]!;

      // Cap enforced server-side, per role. A receptionist cannot exceed the
      // org's setting; the UI hiding the field is not a control.
      const capPct = discountCapPct(user.role as never, org.discountMaxPct);
      const maxDiscount = Math.floor((plan.priceRial * capPct) / 100);
      if (body.discountRial > maxDiscount) {
        throw new AppError('DISCOUNT_EXCEEDS_CAP', { maxRial: maxDiscount, capPct });
      }

      const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
      const endsAt = computeEndsAt(
        {
          kind: plan.kind as PlanKind,
          durationDays: plan.durationDays,
          sessionCount: plan.sessionCount,
        },
        startsAt,
      );

      await tx.insert(m).values({
        id: membershipId,
        orgId: user.orgId,
        personId: body.personId,
        planId: plan.id,
        locationId: plan.locationId ?? org.locationId,
        status: 'active',
        startsAt,
        endsAt,
        sessionsTotal: plan.sessionCount,
        sessionsUsed: 0,
        listPriceRial: plan.priceRial,
        discountRial: body.discountRial,
        soldByStaffId: user.staffId,
        trainerId: body.trainerId ?? null,
        jalaliYm: jalaliYm(startsAt),
      });

      const receivable = await memberAccount(tx, user.orgId, body.personId, 'member_receivable');
      const revenue = await orgAccount(tx, user.orgId, 'revenue_tuition');
      const discount = await orgAccount(tx, user.orgId, 'discount');

      await postTransaction(
        tx,
        membershipSale({
          receivableId: receivable,
          revenueId: revenue,
          discountId: discount,
          listPriceRial: plan.priceRial,
          discountRial: body.discountRial,
        }),
        {
          orgId: user.orgId,
          occurredAt: startsAt,
          refTable: 'membership',
          refId: membershipId,
          createdByStaffId: user.staffId,
        },
      );

      // The member's stage advances on their first sale.
      await tx.execute(sql`
        UPDATE person SET stage = 'active',
                          converted_at = COALESCE(converted_at, now()),
                          member_no = COALESCE(member_no,
                            (SELECT COALESCE(MAX(member_no), 999) + 1 FROM person WHERE org_id = ${user.orgId}))
         WHERE id = ${body.personId}
      `);

      await this.snapshots.recompute(tx, user.orgId, body.personId);
    });

    return { id: membershipId };
  }

  async freeze(user: AuthUser, membershipId: string, body: FreezeMembershipBody): Promise<void> {
    await this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.select().from(m).where(eq(m.id, membershipId)).limit(1);
      const row = rows[0];
      if (!row) throw new NotFoundException();
      if (row.status === 'frozen') throw new AppError('MEMBERSHIP_FROZEN');

      await tx.insert(mf).values({
        id: randomUUID(),
        orgId: user.orgId,
        membershipId,
        fromAt: body.fromAt ? new Date(body.fromAt) : new Date(),
        reason: body.reason ?? null,
        createdByStaffId: user.staffId,
      });
      await tx.update(m).set({ status: 'frozen', updatedAt: sql`now()` }).where(eq(m.id, membershipId));
      await this.snapshots.recompute(tx, user.orgId, row.personId);
    });
  }

  /** Unfreezing pushes `endsAt` out by exactly the days the member lost. */
  async unfreeze(user: AuthUser, membershipId: string, body: UnfreezeMembershipBody): Promise<void> {
    await this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.select().from(m).where(eq(m.id, membershipId)).limit(1);
      const row = rows[0];
      if (!row) throw new NotFoundException();

      const openRows = await tx
        .select()
        .from(mf)
        .where(and(eq(mf.membershipId, membershipId), sql`${mf.toAt} IS NULL`))
        .limit(1);
      const open = openRows[0];
      if (!open) throw new AppError('MEMBERSHIP_FROZEN', { reason: 'no_open_freeze' });

      const toAt = body.toAt ? new Date(body.toAt) : new Date();
      const days = freezeDaysCredited(open.fromAt, toAt);

      await tx.update(mf).set({ toAt, daysCredited: days }).where(eq(mf.id, open.id));
      await tx
        .update(m)
        .set({
          status: 'active',
          endsAt: extendForFreeze(row.endsAt, days),
          updatedAt: sql`now()`,
        })
        .where(eq(m.id, membershipId));

      await this.snapshots.recompute(tx, user.orgId, row.personId);
    });
  }

  /** Renewal starts the day after the current period, never mid-period. */
  async renew(user: AuthUser, membershipId: string, planId?: string): Promise<{ id: string }> {
    const current = await this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.select().from(m).where(eq(m.id, membershipId)).limit(1);
      if (!rows[0]) throw new NotFoundException();
      return rows[0];
    });

    return this.sell(user, {
      personId: current.personId,
      planId: planId ?? current.planId,
      startsAt: renewalStart(current.endsAt).toISOString(),
      discountRial: 0,
    });
  }
}
