import { Injectable, NotFoundException } from '@nestjs/common';
import type { CheckInResultDto, CreateCheckInBody, CheckInsQuery } from '@gymos/contracts';
import { jalaliYm } from '@gymos/core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AccessSnapshotService } from '../access/access-snapshot.service.js';
import { can } from '../auth/permissions.js';
import type { AuthUser } from '../auth/staff-auth.guard.js';
import { TenantDb, type Tx } from '../infra/tenant.db.js';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly db: TenantDb,
    private readonly snapshots: AccessSnapshotService,
  ) {}

  /**
   * Admit or refuse a member.
   *
   * The decision is **read from `access_snapshot`**, never computed live. That
   * is not an optimisation — it is the design that makes offline check-in
   * possible (design/offline-sync.md §1). The desk and a disconnected kiosk run
   * the identical logic against the identical precomputed row, so they can never
   * disagree about whether someone may enter.
   *
   * A check-in is an append-only historical fact, so a replayed
   * `clientEventId` is a no-op rather than an error — that is what lets an
   * offline outbox flush safely.
   */
  async create(user: AuthUser, body: CreateCheckInBody): Promise<CheckInResultDto> {
    return this.db.withOrg(user.orgId, async (tx) => {
      // Replay check first: an offline kiosk flushing its outbox must be able to
      // send the same event repeatedly without consuming a second session.
      const existing = await tx.execute<Record<string, unknown>>(sql`
        SELECT c.id, c.admitted, c.denial_reason AS "denialReason",
               p.first_name AS "firstName", p.last_name AS "lastName"
          FROM check_in c JOIN person p ON p.id = c.person_id
         WHERE c.org_id = ${user.orgId} AND c.client_event_id = ${body.clientEventId}
         LIMIT 1
      `);
      const prior = (existing as unknown as Record<string, unknown>[])[0];
      if (prior) {
        const snap = await this.readSnapshot(tx, body.personId);
        return {
          id: prior.id as string,
          admitted: prior.admitted as boolean,
          reasonCode: ((prior.denialReason as string | null) ??
            'ok') as CheckInResultDto['reasonCode'],
          personId: body.personId,
          firstName: prior.firstName as string,
          lastName: prior.lastName as string,
          sessionsRemaining: snap?.sessionsRemaining ?? null,
          arrearsRial: snap?.arrearsRial ?? 0,
          duplicate: true,
        };
      }

      const snap = await this.readSnapshot(tx, body.personId);
      if (!snap) throw new NotFoundException();

      // A refusal can be overridden by staff who hold the capability. Never make
      // staff fight the software — they will work around it and you lose the
      // audit trail entirely (design/receptionist-flow.md §4).
      const overriding =
        body.override && !snap.canEnter && can(user.role as never, 'checkin.override');
      const admitted = snap.canEnter || overriding;

      const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
      const consumes = admitted && snap.sessionsRemaining !== null;
      const id = randomUUID();

      await tx.execute(sql`
        INSERT INTO check_in
          (id, org_id, person_id, location_id, membership_id, method, occurred_at,
           synced_at, was_offline, session_consumed, admitted, denial_reason,
           overridden_by_staff_id, client_event_id, jalali_ym)
        VALUES (${id}, ${user.orgId}, ${body.personId}, ${snap.locationId},
                ${snap.membershipId}, ${body.method}, ${occurredAt.toISOString()},
                now(), false, ${consumes}, ${admitted},
                ${admitted ? null : snap.reasonCode},
                ${overriding ? user.staffId : null},
                ${body.clientEventId}, ${jalaliYm(occurredAt)})
      `);

      if (consumes && snap.membershipId) {
        await tx.execute(sql`
          UPDATE membership SET sessions_used = sessions_used + 1, updated_at = now()
           WHERE id = ${snap.membershipId}
        `);
      }

      // Recompute so the next scan — and every kiosk — sees the new count.
      const decision = await this.snapshots.recompute(tx, user.orgId, body.personId);

      return {
        id,
        admitted,
        reasonCode: (admitted
          ? 'ok'
          : snap.reasonCode) as CheckInResultDto['reasonCode'],
        personId: body.personId,
        firstName: snap.firstName,
        lastName: snap.lastName,
        sessionsRemaining: decision?.sessionsRemaining ?? snap.sessionsRemaining,
        arrearsRial: snap.arrearsRial,
        duplicate: false,
      };
    });
  }

  /** Today's activity feed for the Desk. */
  async list(user: AuthUser, query: CheckInsQuery) {
    return this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT c.id, c.occurred_at AS "occurredAt", c.method, c.admitted,
               c.denial_reason AS "denialReason", c.was_offline AS "wasOffline",
               c.overridden_by_staff_id IS NOT NULL AS "overridden",
               p.id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName"
          FROM check_in c JOIN person p ON p.id = c.person_id
         WHERE c.occurred_at >= COALESCE(${query.date ?? null}::timestamptz, date_trunc('day', now()))
           AND c.occurred_at <  COALESCE(${query.date ?? null}::timestamptz, date_trunc('day', now())) + interval '1 day'
         ORDER BY c.occurred_at DESC
         LIMIT ${query.limit}
      `);
      return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        occurredAt: new Date(r.occurredAt as string).toISOString(),
        method: r.method as string,
        admitted: r.admitted as boolean,
        denialReason: (r.denialReason as string | null) ?? null,
        wasOffline: r.wasOffline as boolean,
        overridden: r.overridden as boolean,
        personId: r.personId as string,
        firstName: r.firstName as string,
        lastName: r.lastName as string,
      }));
    });
  }

  /** The precomputed decision. The desk and a kiosk read the identical row. */
  private async readSnapshot(tx: Tx, personId: string) {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT a.location_id AS "locationId", a.can_enter AS "canEnter",
             a.reason_code AS "reasonCode", a.membership_id AS "membershipId",
             a.sessions_remaining AS "sessionsRemaining", a.arrears_rial::text AS "arrearsRial",
             p.first_name AS "firstName", p.last_name AS "lastName"
        FROM access_snapshot a JOIN person p ON p.id = a.person_id
       WHERE a.person_id = ${personId}
       LIMIT 1
    `);
    const r = (rows as unknown as Record<string, unknown>[])[0];
    if (!r) return null;
    return {
      locationId: r.locationId as string,
      canEnter: r.canEnter as boolean,
      reasonCode: (r.reasonCode as string) ?? 'ok',
      membershipId: (r.membershipId as string | null) ?? null,
      sessionsRemaining: (r.sessionsRemaining as number | null) ?? null,
      arrearsRial: Number(r.arrearsRial ?? 0),
      firstName: r.firstName as string,
      lastName: r.lastName as string,
    };
  }
}
