import { Injectable } from '@nestjs/common';
import { jalaliYm } from '@gymos/core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/staff-auth.guard.js';
import { TenantDb, type Tx } from '../infra/tenant.db.js';

/**
 * The sync protocol behind offline check-in — design/offline-sync.md.
 *
 * Two endpoints, and the whole design rests on two properties:
 *
 *   - the admission decision is PRECOMPUTED, so a kiosk reads a boolean from
 *     IndexedDB rather than asking the server
 *   - a check-in is an append-only FACT, so replaying one is a duplicate to
 *     suppress, not a conflict to merge
 *
 * There is no merge algorithm here because there is nothing to merge.
 */

export interface SnapshotRow {
  personId: string;
  firstName: string;
  lastName: string;
  mobileLast4: string;
  memberNo: number | null;
  canEnter: boolean;
  reasonCode: string | null;
  membershipId: string | null;
  sessionsRemaining: number | null;
  arrearsRial: number;
  validUntil: string;
  rev: number;
}

export interface SnapshotPage {
  rev: number;
  full: boolean;
  upserts: SnapshotRow[];
  deletes: string[];
  serverTime: string;
}

export interface FlushEvent {
  clientEventId: string;
  personId: string;
  occurredAt: string;
  method: string;
  admitted: boolean;
  denialReason?: string | null;
}

/** How far back revision history is kept before a client must take a full page. */
const MAX_DELTA_ROWS = 2_000;

/** Clock skew tolerance — see §7. A gym PC's clock is routinely wrong. */
const SKEW_ALLOWANCE_MS = 5 * 60_000;

@Injectable()
export class SyncService {
  constructor(private readonly db: TenantDb) {}

  /**
   * Deltas by monotonic `rev`, not timestamp.
   *
   * Timestamps would be the obvious key and are the wrong one: the client's
   * clock is untrustworthy and the server's can move. A counter per location
   * cannot.
   */
  async snapshot(user: AuthUser, locationId: string, since: number | null): Promise<SnapshotPage> {
    return this.db.withOrg(user.orgId, async (tx) => {
      const head = await this.headRev(tx, locationId);

      // An unknown or too-distant `since` gets the whole set rather than a
      // silently incomplete delta.
      const behind = since === null ? Infinity : head - since;
      const full = behind > MAX_DELTA_ROWS;
      const from = full ? 0 : (since ?? 0);

      const rows = await tx.execute<Record<string, unknown>>(sql`
        SELECT a.person_id          AS "personId",
               p.first_name         AS "firstName",
               p.last_name          AS "lastName",
               right(p.mobile, 4)   AS "mobileLast4",
               p.member_no          AS "memberNo",
               a.can_enter          AS "canEnter",
               a.reason_code        AS "reasonCode",
               a.membership_id      AS "membershipId",
               a.sessions_remaining AS "sessionsRemaining",
               a.arrears_rial::text AS "arrearsRial",
               a.valid_until        AS "validUntil",
               a.rev
          FROM access_snapshot a
          JOIN person p ON p.id = a.person_id
         WHERE a.location_id = ${locationId}
           AND a.rev > ${from}
           AND p.deleted_at IS NULL
         ORDER BY a.rev
         LIMIT ${MAX_DELTA_ROWS}
      `);

      const upserts = (rows as unknown as Record<string, unknown>[]).map((r) => ({
        personId: r.personId as string,
        firstName: r.firstName as string,
        lastName: r.lastName as string,
        mobileLast4: r.mobileLast4 as string,
        memberNo: (r.memberNo as number | null) ?? null,
        canEnter: r.canEnter as boolean,
        reasonCode: (r.reasonCode as string | null) ?? null,
        membershipId: (r.membershipId as string | null) ?? null,
        sessionsRemaining: (r.sessionsRemaining as number | null) ?? null,
        arrearsRial: Number(r.arrearsRial ?? 0),
        validUntil: new Date(r.validUntil as string).toISOString(),
        rev: Number(r.rev),
      }));

      // Soft-deleted people the kiosk may still be caching.
      const gone = await tx.execute<{ id: string }>(sql`
        SELECT p.id FROM person p
          JOIN access_snapshot a ON a.person_id = p.id AND a.location_id = ${locationId}
         WHERE p.deleted_at IS NOT NULL
         LIMIT 500
      `);

      return {
        rev: upserts.length ? upserts[upserts.length - 1]!.rev : head,
        full,
        upserts,
        deletes: (gone as unknown as { id: string }[]).map((g) => g.id),
        // Lets the kiosk measure its own clock offset — §7.
        serverTime: new Date().toISOString(),
      };
    });
  }

  /**
   * Flush an outbox.
   *
   * Accepted and duplicate are BOTH success from the client's point of view: it
   * deletes the event either way. Rejections are rare and real — a person
   * removed between caching and flushing — and must not be retried forever.
   */
  async flush(
    user: AuthUser,
    locationId: string,
    events: FlushEvent[],
  ): Promise<{
    accepted: string[];
    duplicates: string[];
    rejected: { clientEventId: string; code: string }[];
    rev: number;
  }> {
    return this.db.withOrg(user.orgId, async (tx) => {
      const accepted: string[] = [];
      const duplicates: string[] = [];
      const rejected: { clientEventId: string; code: string }[] = [];
      const receivedAt = Date.now();

      for (const e of events) {
        const dup = await tx.execute<{ id: string }>(sql`
          SELECT id FROM check_in
           WHERE org_id = ${user.orgId} AND client_event_id = ${e.clientEventId} LIMIT 1
        `);
        if ((dup as unknown as { id: string }[])[0]) {
          duplicates.push(e.clientEventId);
          continue;
        }

        const exists = await tx.execute<{ id: string }>(sql`
          SELECT id FROM person WHERE id = ${e.personId} AND deleted_at IS NULL LIMIT 1
        `);
        if (!(exists as unknown as { id: string }[])[0]) {
          rejected.push({ clientEventId: e.clientEventId, code: 'PERSON_NOT_FOUND' });
          continue;
        }

        const occurredAt = clampToPlausible(new Date(e.occurredAt), receivedAt);

        await tx.execute(sql`
          INSERT INTO check_in
            (id, org_id, person_id, location_id, membership_id, method, occurred_at,
             synced_at, was_offline, session_consumed, admitted, denial_reason,
             client_event_id, jalali_ym)
          SELECT ${randomUUID()}, ${user.orgId}, ${e.personId}, ${locationId},
                 a.membership_id, ${e.method}, ${occurredAt.toISOString()},
                 now(), true,
                 ${e.admitted} AND a.sessions_remaining IS NOT NULL,
                 ${e.admitted}, ${e.denialReason ?? null},
                 ${e.clientEventId}, ${jalaliYm(occurredAt)}
            FROM access_snapshot a
           WHERE a.person_id = ${e.personId} AND a.location_id = ${locationId}
        `);
        accepted.push(e.clientEventId);
      }

      return { accepted, duplicates, rejected, rev: await this.headRev(tx, locationId) };
    });
  }

  private async headRev(tx: Tx, locationId: string): Promise<number> {
    const rows = await tx.execute<{ rev: string }>(sql`
      SELECT COALESCE(MAX(rev), 0)::text AS rev FROM access_snapshot
       WHERE location_id = ${locationId}
    `);
    return Number((rows as unknown as { rev: string }[])[0]?.rev ?? 0);
  }
}

/**
 * Clamp a client timestamp into a plausible window — design/offline-sync.md §7.
 *
 * A gym PC's clock is routinely minutes or hours wrong, and a check-in stamped
 * in the future corrupts attendance reports and the per-member baselines the
 * retention rules depend on. The raw value is not trusted; the clamp is the
 * only defence, because the client cannot be fixed remotely.
 *
 * Exported for testing — this is pure arithmetic and deserves to be pinned.
 */
export function clampToPlausible(
  occurredAt: Date,
  receivedAtMs: number,
  maxOfflineMs = 7 * 24 * 60 * 60_000,
): Date {
  const t = occurredAt.getTime();
  if (Number.isNaN(t)) return new Date(receivedAtMs);
  const earliest = receivedAtMs - maxOfflineMs - SKEW_ALLOWANCE_MS;
  const latest = receivedAtMs + SKEW_ALLOWANCE_MS;
  if (t < earliest) return new Date(earliest);
  // Never accept a future check-in beyond the skew allowance.
  if (t > latest) return new Date(receivedAtMs);
  return occurredAt;
}
