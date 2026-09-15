import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AppError,
  type CreatePersonBody,
  type MemberCardDto,
  type SearchQuery,
  type SearchResultDto,
  type UpdatePersonBody,
} from '@gymos/contracts';
import { normalizePersianText } from '@gymos/core';
import { person as personTable } from '@gymos/db';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/staff-auth.guard.js';
import { TenantDb } from '../infra/tenant.db.js';
import { planSearch, rankResults } from './search.js';

/**
 * Note the shape of every method: they take the authenticated `AuthUser`, not a
 * bare `orgId` string. A controller therefore cannot pass an arbitrary org — it
 * can only pass the principal it was handed. That removes the footgun an
 * interceptor was meant to solve, without the AsyncLocalStorage machinery.
 */
@Injectable()
export class PeopleService {
  constructor(private readonly db: TenantDb) {}

  async search(user: AuthUser, query: SearchQuery): Promise<SearchResultDto[]> {
    const plan = planSearch(query.q);

    // One query covering both digit interpretations and the name path. The
    // planner picks an index per branch; the ambiguous-digit case costs one
    // extra probe rather than a wrong answer.
    const rows = await this.db.withOrg(user.orgId, async (tx) =>
      tx.execute<{
        id: string;
        firstName: string;
        lastName: string;
        mobile: string;
        memberNo: number | null;
        searchName: string;
        stage: string;
        canEnter: boolean | null;
        arrearsRial: string | null;
      }>(sql`
        SELECT p.id,
               p.first_name   AS "firstName",
               p.last_name    AS "lastName",
               p.mobile,
               p.member_no    AS "memberNo",
               p.search_name  AS "searchName",
               p.stage,
               a.can_enter    AS "canEnter",
               COALESCE(v.arrears_rial, 0)::text AS "arrearsRial"
          FROM person p
          LEFT JOIN access_snapshot a ON a.person_id = p.id
          LEFT JOIN v_member_arrears v ON v.person_id = p.id
         WHERE p.deleted_at IS NULL
           AND (
                 ${plan.mobileSuffix ? sql`p.mobile LIKE ${'%' + plan.mobileSuffix}` : sql`false`}
              OR ${plan.memberNo !== undefined ? sql`p.member_no = ${plan.memberNo}` : sql`false`}
              OR ${plan.needle ? sql`p.search_name LIKE ${'%' + plan.needle + '%'}` : sql`false`}
               )
         LIMIT ${query.limit * 4}
      `),
    );

    const list = rows as unknown as Parameters<typeof rankResults>[1];
    return rankResults(plan, list)
      .slice(0, query.limit)
      .map((r) => {
        const row = r as unknown as {
          id: string;
          firstName: string;
          lastName: string;
          mobile: string;
          memberNo: number | null;
          stage: string;
          canEnter: boolean | null;
          arrearsRial: string | null;
        };
        return {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          mobile: row.mobile,
          memberNo: row.memberNo,
          stage: row.stage as SearchResultDto['stage'],
          canEnter: row.canEnter,
          arrearsRial: Number(row.arrearsRial ?? 0),
        };
      });
  }

  /** The member card — four facts in fixed positions, design/api-design.md §5. */
  async getCard(user: AuthUser, personId: string): Promise<MemberCardDto> {
    const rows = await this.db.withOrg(user.orgId, async (tx) =>
      tx.execute<Record<string, unknown>>(sql`
        SELECT p.id, p.first_name AS "firstName", p.last_name AS "lastName",
               p.mobile, p.member_no AS "memberNo", p.photo_key AS "photoKey", p.stage,
               m.id AS "membershipId", pl.name AS "planName", m.status AS "membershipStatus",
               m.ends_at AS "endsAt", m.sessions_total AS "sessionsTotal",
               m.sessions_used AS "sessionsUsed",
               COALESCE(v.arrears_rial, 0)::text AS "arrearsRial",
               v.oldest_debit_at AS "oldestDebitAt",
               COALESCE(-w.balance_rial, 0)::text AS "walletRial",
               lk.code AS "lockerCode", lk.kind AS "lockerKind",
               a.can_enter AS "canEnter", a.reason_code AS "reasonCode"
          FROM person p
          LEFT JOIN LATERAL (
                 SELECT * FROM membership mm
                  WHERE mm.person_id = p.id AND mm.status IN ('active','frozen')
                  ORDER BY mm.ends_at DESC NULLS LAST LIMIT 1
               ) m ON true
          LEFT JOIN plan pl ON pl.id = m.plan_id
          LEFT JOIN v_member_arrears v ON v.person_id = p.id
          LEFT JOIN ledger_account wa ON wa.person_id = p.id AND wa.kind = 'member_wallet'
          LEFT JOIN v_account_balance w ON w.account_id = wa.id
          LEFT JOIN LATERAL (
                 SELECT l.code, l.kind FROM locker_assignment la
                   JOIN locker l ON l.id = la.locker_id
                  WHERE la.person_id = p.id AND la.to_at IS NULL LIMIT 1
               ) lk ON true
          LEFT JOIN access_snapshot a ON a.person_id = p.id
         WHERE p.id = ${personId} AND p.deleted_at IS NULL
         LIMIT 1
      `),
    );

    const r = (rows as unknown as Record<string, unknown>[])[0];
    if (!r) throw new NotFoundException();

    const sessionsTotal = r.sessionsTotal as number | null;
    const sessionsUsed = (r.sessionsUsed as number | null) ?? 0;
    const endsAt = r.endsAt as Date | null;
    const oldest = r.oldestDebitAt as Date | null;
    const DAY = 86_400_000;

    return {
      person: {
        id: r.id as string,
        firstName: r.firstName as string,
        lastName: r.lastName as string,
        mobile: r.mobile as string,
        memberNo: (r.memberNo as number | null) ?? null,
        photoUrl: (r.photoKey as string | null) ?? null,
        stage: r.stage as MemberCardDto['person']['stage'],
      },
      membership: r.membershipId
        ? {
            id: r.membershipId as string,
            planName: (r.planName as string) ?? '—',
            status: r.membershipStatus as MemberCardDto['membership'] extends null
              ? never
              : 'active',
            endsAt: endsAt ? new Date(endsAt).toISOString() : null,
            daysRemaining: endsAt
              ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY)
              : null,
            sessionsRemaining: sessionsTotal === null ? null : sessionsTotal - sessionsUsed,
            sessionsTotal,
          }
        : null,
      arrearsRial: Number(r.arrearsRial ?? 0),
      arrearsAgeDays: oldest
        ? Math.floor((Date.now() - new Date(oldest).getTime()) / DAY)
        : null,
      walletRial: Math.max(0, Number(r.walletRial ?? 0)),
      locker: r.lockerCode
        ? { code: r.lockerCode as string, kind: r.lockerKind as string }
        : null,
      access: {
        canEnter: (r.canEnter as boolean | null) ?? false,
        reasonCode: ((r.reasonCode as string | null) ??
          'no_membership') as MemberCardDto['access']['reasonCode'],
      },
    };
  }

  async create(user: AuthUser, body: CreatePersonBody): Promise<{ id: string }> {
    const id = randomUUID();
    await this.db.withOrg(user.orgId, async (tx) => {
      const clash = await tx
        .select({ id: personTable.id })
        .from(personTable)
        .where(and(eq(personTable.orgId, user.orgId), eq(personTable.mobile, body.mobile)))
        .limit(1);
      // D-001: mobile is unique per org. If gym visits overturn that, this check
      // and the index move together.
      if (clash[0]) throw new AppError('DUPLICATE_MOBILE');

      const loc = await tx.execute<{ id: string }>(sql`
        SELECT id FROM location WHERE org_id = ${user.orgId} AND deleted_at IS NULL
         ORDER BY is_primary DESC, created_at LIMIT 1
      `);

      await tx.insert(personTable).values({
        id,
        orgId: user.orgId,
        homeLocationId: (loc as unknown as { id: string }[])[0]?.id ?? null,
        firstName: body.firstName,
        lastName: body.lastName,
        mobile: body.mobile,
        searchName: normalizePersianText(`${body.firstName} ${body.lastName}`).toLowerCase(),
        gender: body.gender ?? null,
        birthDate: body.birthDate ?? null,
        nationalId: body.nationalId ?? null,
        source: body.source ?? 'walk_in',
        notes: body.notes ?? null,
        stage: 'lead',
      });
    });
    return { id };
  }

  async update(user: AuthUser, personId: string, body: UpdatePersonBody): Promise<{ id: string }> {
    await this.db.withOrg(user.orgId, async (tx) => {
      const existing = await tx
        .select({ firstName: personTable.firstName, lastName: personTable.lastName })
        .from(personTable)
        .where(eq(personTable.id, personId))
        .limit(1);
      if (!existing[0]) throw new NotFoundException();

      const firstName = body.firstName ?? existing[0].firstName;
      const lastName = body.lastName ?? existing[0].lastName;

      await tx
        .update(personTable)
        .set({
          ...(body.firstName !== undefined ? { firstName } : {}),
          ...(body.lastName !== undefined ? { lastName } : {}),
          ...(body.mobile !== undefined ? { mobile: body.mobile } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.birthDate !== undefined ? { birthDate: body.birthDate } : {}),
          ...(body.nationalId !== undefined ? { nationalId: body.nationalId } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          // searchName is derived — never let it drift from the name it indexes.
          searchName: normalizePersianText(`${firstName} ${lastName}`).toLowerCase(),
          updatedAt: sql`now()`,
        })
        .where(eq(personTable.id, personId));
    });
    return { id: personId };
  }
}
