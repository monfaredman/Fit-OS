/**
 * Recomputes the precomputed door decision.
 *
 * This is what makes offline check-in possible: the kiosk reads a boolean from
 * its cache rather than asking the server (design/offline-sync.md §1). The
 * snapshot must therefore be refreshed on *every* write that could change the
 * answer — membership sale, freeze, unfreeze, renewal, payment, check-in.
 *
 * `rev` is a monotonic counter per location, not a timestamp: gym PC clocks are
 * wrong, and the kiosk pages deltas by `rev`.
 */

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { decideAccess, type ArrearsPolicy } from '../memberships/membership-rules.js';
import type { Tx } from '../infra/tenant.db.js';

/** How stale a cached decision may be before the kiosk must refresh it. */
const VALID_FOR_MS = 15 * 60_000;

@Injectable()
export class AccessSnapshotService {
  /**
   * Recompute for one person at their home location. Returns the decision so
   * callers (check-in) can use it without a second read.
   */
  async recompute(tx: Tx, orgId: string, personId: string) {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(
               p.home_location_id,
               -- A person created at the desk has no home location yet; fall back to
               -- the org's primary site rather than silently skipping the
               -- snapshot, which would leave the door decision as "no membership".
               (SELECT id FROM location WHERE org_id = p.org_id AND deleted_at IS NULL
                 ORDER BY is_primary DESC, created_at LIMIT 1)
             )                                  AS "locationId",
             o.arrears_policy                  AS "policy",
             o.arrears_grace_rial              AS "graceRial",
             m.id                              AS "membershipId",
             m.status                          AS "status",
             m.starts_at                       AS "startsAt",
             m.ends_at                         AS "endsAt",
             m.sessions_total                  AS "sessionsTotal",
             m.sessions_used                   AS "sessionsUsed",
             COALESCE(v.arrears_rial, 0)::text AS "arrearsRial"
        FROM person p
        JOIN organization o ON o.id = p.org_id
        LEFT JOIN LATERAL (
               SELECT * FROM membership mm
                WHERE mm.person_id = p.id AND mm.status IN ('active', 'frozen')
                ORDER BY mm.ends_at DESC NULLS LAST LIMIT 1
             ) m ON true
        LEFT JOIN v_member_arrears v ON v.person_id = p.id
       WHERE p.id = ${personId}
       LIMIT 1
    `);

    const r = (rows as unknown as Record<string, unknown>[])[0];
    if (!r || !r.locationId) return null;

    const decision = decideAccess({
      membership: r.membershipId
        ? {
            status: r.status as string,
            startsAt: new Date(r.startsAt as string),
            endsAt: r.endsAt ? new Date(r.endsAt as string) : null,
            sessionsTotal: (r.sessionsTotal as number | null) ?? null,
            sessionsUsed: (r.sessionsUsed as number | null) ?? 0,
          }
        : null,
      arrearsRial: Number(r.arrearsRial ?? 0),
      policy: r.policy as ArrearsPolicy,
      graceRial: Number(r.graceRial ?? 0),
    });

    const locationId = r.locationId as string;
    const validUntil = new Date(Date.now() + VALID_FOR_MS);

    await tx.execute(sql`
      INSERT INTO access_snapshot
        (person_id, location_id, org_id, can_enter, reason_code, membership_id,
         sessions_remaining, arrears_rial, valid_until, rev, computed_at)
      VALUES (${personId}, ${locationId}, ${orgId}, ${decision.canEnter},
              ${decision.reasonCode}, ${(r.membershipId as string) ?? null},
              ${decision.sessionsRemaining}, ${Number(r.arrearsRial ?? 0)},
              ${validUntil.toISOString()},
              (SELECT COALESCE(MAX(rev), 0) + 1 FROM access_snapshot WHERE location_id = ${locationId}),
              now())
      ON CONFLICT (person_id, location_id) DO UPDATE SET
        can_enter          = EXCLUDED.can_enter,
        reason_code        = EXCLUDED.reason_code,
        membership_id      = EXCLUDED.membership_id,
        sessions_remaining = EXCLUDED.sessions_remaining,
        arrears_rial       = EXCLUDED.arrears_rial,
        valid_until        = EXCLUDED.valid_until,
        rev                = EXCLUDED.rev,
        computed_at        = now()
    `);

    return decision;
  }
}
