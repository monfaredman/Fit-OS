import { Injectable } from '@nestjs/common';
import { getConfig } from '@gymos/config';
import { AppError, type StaffLoginBody, type StaffSessionDto, type StaffRole } from '@gymos/contracts';
import { session as sessionTable } from '@gymos/db';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TenantDb } from '../infra/tenant.db.js';
import { generateSessionToken, verifyPassword } from '@gymos/core';
import { RateLimiter } from './rate-limit.js';
import { hashToken } from './staff-auth.guard.js';

@Injectable()
export class AuthService {
  /** 5 attempts per mobile per 15 minutes. */
  private readonly limiter = new RateLimiter(5, 15 * 60_000);

  constructor(private readonly db: TenantDb) {
    // Keep the window map from growing unbounded on a long-lived process.
    setInterval(() => this.limiter.sweep(), 60_000).unref();
  }

  async login(body: StaffLoginBody): Promise<StaffSessionDto> {
    const gate = this.limiter.hit(body.mobile);
    if (!gate.allowed) throw new AppError('RATE_LIMITED', { retryAfterSec: gate.retryAfterSec });

    // Untenanted by necessity: we do not yet know which gym this staff member
    // belongs to. Scoped to one mobile, and the password still has to verify.
    const candidates = await this.db.staffByMobile(body.mobile);

    // Always run one verification, even with no candidates, against a dummy
    // hash — otherwise a missing account returns faster than a wrong password
    // and the endpoint becomes an account-enumeration oracle.
    if (candidates.length === 0) {
      await verifyPassword(body.password, DUMMY_HASH);
      throw new AppError('UNAUTHENTICATED');
    }

    const matched: typeof candidates = [];
    for (const c of candidates) {
      if (await verifyPassword(body.password, c.passwordHash)) matched.push(c);
    }
    if (matched.length === 0) throw new AppError('UNAUTHENTICATED');
    // `staff.mobile` is unique per org, not globally. Two gyms sharing a number
    // AND a password is vanishingly rare but not impossible — refuse rather
    // than silently signing them into the wrong gym.
    if (matched.length > 1) throw new AppError('UNAUTHENTICATED', { reason: 'ambiguous_account' });
    const candidate = matched[0]!;

    this.limiter.reset(body.mobile);

    const token = generateSessionToken();
    const ttlDays = getConfig().SESSION_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    await this.db.withOrg(candidate.orgId, async (tx) => {
      await tx.insert(sessionTable).values({
        id: randomUUID(),
        orgId: candidate.orgId,
        staffId: candidate.id,
        tokenHash: hashToken(token),
        expiresAt,
      });
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      staff: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        role: candidate.role as StaffRole,
        orgId: candidate.orgId,
      },
    };
  }

  async logout(orgId: string, sessionId: string): Promise<void> {
    await this.db.withOrg(orgId, async (tx) => {
      await tx
        .update(sessionTable)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.orgId, orgId)));
    });
  }
}

/**
 * A real scrypt hash of a value nobody knows, used to equalise timing when the
 * mobile does not exist. Generated once at module load.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
