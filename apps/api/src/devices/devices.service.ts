import { Injectable, NotFoundException } from '@nestjs/common';
import { AppError } from '@gymos/contracts';
import { device as deviceTable } from '@gymos/db';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  generateDeviceSecret,
  generatePairingCode,
  hashSecret,
  PAIRING_TTL_MS,
} from '../auth/device-auth.guard.js';
import type { AuthUser } from '../auth/staff-auth.guard.js';
import { TenantDb } from '../infra/tenant.db.js';

@Injectable()
export class DevicesService {
  constructor(private readonly db: TenantDb) {}

  /**
   * Staff generate a pairing code on the Desk and read it to whoever is
   * standing at the kiosk. Ten minutes, single use.
   *
   * The plaintext code is returned exactly once, here. Only its hash is stored,
   * so a database dump does not let anyone pair a device.
   */
  async createPairingCode(
    user: AuthUser,
    locationId: string,
    kind: string,
    label?: string,
  ): Promise<{ code: string; expiresAt: string; deviceId: string }> {
    const code = generatePairingCode();
    const deviceId = randomUUID();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

    await this.db.withOrg(user.orgId, async (tx) => {
      const loc = await tx.execute<{ id: string }>(sql`
        SELECT id FROM location WHERE id = ${locationId} AND deleted_at IS NULL LIMIT 1
      `);
      if (!(loc as unknown as { id: string }[])[0]) throw new NotFoundException();

      await tx.insert(deviceTable).values({
        id: deviceId,
        orgId: user.orgId,
        locationId,
        kind,
        label: label ?? null,
        secretHash: null,
        pairingCodeHash: hashSecret(code),
        pairingExpiresAt: expiresAt,
      });
    });

    return { code, expiresAt: expiresAt.toISOString(), deviceId };
  }

  /**
   * The kiosk redeems its code. Unauthenticated by necessity — the device has
   * no credential yet, which is the whole point of pairing.
   *
   * Safe because the code is single-use, expires in ten minutes, and the redeem
   * is one atomic statement that burns the code as it mints the secret.
   */
  async redeem(code: string): Promise<{
    deviceSecret: string;
    deviceId: string;
    orgId: string;
    locationId: string;
  }> {
    const deviceSecret = generateDeviceSecret();
    const row = await this.db.redeemPairingCode(hashSecret(code), hashSecret(deviceSecret));
    // An expired, wrong or already-used code are indistinguishable on purpose:
    // the response must not tell an attacker which codes exist.
    if (!row) throw new AppError('UNAUTHENTICATED');
    return { deviceSecret, ...row };
  }

  async list(user: AuthUser) {
    return this.db.withOrg(user.orgId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT d.id, d.kind, d.label, d.paired_at AS "pairedAt", d.revoked_at AS "revokedAt",
               d.last_seen_at AS "lastSeenAt", d.agent_version AS "agentVersion",
               d.clock_offset_ms AS "clockOffsetMs", l.name AS "locationName"
          FROM device d JOIN location l ON l.id = d.location_id
         ORDER BY d.created_at DESC
      `);
      return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        kind: r.kind as string,
        label: (r.label as string | null) ?? null,
        locationName: r.locationName as string,
        paired: r.pairedAt !== null,
        revoked: r.revokedAt !== null,
        lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt as string).toISOString() : null,
        clockOffsetMs: (r.clockOffsetMs as number | null) ?? null,
      }));
    });
  }

  /** Revoking is immediate: the resolve function refuses a revoked device. */
  async revoke(user: AuthUser, deviceId: string): Promise<void> {
    await this.db.withOrg(user.orgId, async (tx) => {
      await tx
        .update(deviceTable)
        .set({ revokedAt: sql`now()`, secretHash: null })
        .where(and(eq(deviceTable.id, deviceId), eq(deviceTable.orgId, user.orgId)));
    });
  }

  /** Heartbeat from a paired device. Records clock drift for the operator. */
  async heartbeat(deviceId: string, orgId: string, clockOffsetMs?: number): Promise<void> {
    await this.db.withOrg(orgId, async (tx) => {
      await tx
        .update(deviceTable)
        .set({
          lastSeenAt: sql`now()`,
          ...(clockOffsetMs === undefined ? {} : { clockOffsetMs }),
        })
        .where(eq(deviceTable.id, deviceId));
    });
  }
}
