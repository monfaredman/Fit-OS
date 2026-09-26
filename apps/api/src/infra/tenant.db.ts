/**
 * The only way the application touches Postgres.
 *
 * Invariant 4: every tenant query runs inside a transaction that has set
 * `app.org_id`, so RLS does the isolating rather than a `where` clause someone
 * might forget. This class is the enforcement point — `DatabaseModule` keeps the
 * raw Drizzle handle private and exports only this wrapper, so a service
 * *cannot* obtain an untenanted connection even by accident.
 *
 * The connection is `gymos_app` (NOBYPASSRLS). A table owner would silently
 * bypass every policy, which is how RLS ends up enabled and doing nothing.
 */

import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '@gymos/contracts';
import type { Database } from '@gymos/db';
import { sql } from 'drizzle-orm';
import { DB } from './database.tokens.js';

/** A tenant-scoped transaction handle. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** What a valid bearer token resolves to, before any tenant scope is opened. */
export interface SessionPrincipal extends Record<string, unknown> {
  sessionId: string;
  orgId: string;
  staffId: string;
  expiresAt: Date;
  elevatedUntil: Date | null;
  firstName: string;
  lastName: string;
  role: string;
}

/** A paired device. No staff id, no role — a kiosk is not a person. */
export interface DevicePrincipalRow extends Record<string, unknown> {
  deviceId: string;
  orgId: string;
  locationId: string;
  kind: string;
  label: string | null;
}

/** A login candidate. Carries the password hash — never log or return it. */
export interface StaffCandidate extends Record<string, unknown> {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  role: string;
  passwordHash: string | null;
}

@Injectable()
export class TenantDb {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Run `fn` inside one transaction scoped to `orgId`.
   *
   * `SET LOCAL` means the setting is rolled back with the transaction, so a
   * pooled connection can never leak one request's tenant into the next.
   */
  async withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!orgId) throw new AppError('NO_TENANT');
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
      return fn(tx);
    });
  }

  /**
   * Resolve a session token to its tenant. **Deliberately untenanted** — and it
   * has to be: RLS needs `app.org_id`, but discovering the org is the whole
   * point of this call. Chicken-and-egg, resolved explicitly rather than by
   * quietly weakening a policy.
   *
   * Runs through the `auth_resolve_session` SECURITY DEFINER function, because
   * `gymos_app` is NOBYPASSRLS and an untenanted SELECT would match nothing.
   * The function exposes exactly this one lookup — see 0002_auth_functions.sql.
   *
   * Safe because the lookup key is a SHA-256 of a 256-bit random token: it
   * cannot be enumerated or guessed, and nothing is returned without an exact
   * match. Everything downstream runs inside `withOrg`.
   *
   * This, `staffByMobile()`, `resolveDevice()`, `redeemPairingCode()` and
   * `ping()` are the only untenanted queries in the application. Each is keyed
   * on an unguessable hash and returns at most one row. Adding another
   * requires a very good reason.
   */
  async resolveSession(tokenHash: string): Promise<SessionPrincipal | null> {
    const rows = await this.db.execute<SessionPrincipal>(
      sql`SELECT * FROM auth_resolve_session(${tokenHash})`,
    );
    return (rows as unknown as SessionPrincipal[])[0] ?? null;
  }

  /**
   * Find staff candidates by mobile, across orgs. **Deliberately untenanted**,
   * for the same chicken-and-egg reason as resolveSession: at login we do not
   * yet know the gym.
   *
   * Returns *all* matches because `staff.mobile` is unique per org, not
   * globally — two gyms can legitimately have the same number on file. The
   * caller must verify the password against each and treat more than one
   * success as ambiguous rather than picking arbitrarily.
   *
   * Runs through the `auth_staff_by_mobile` SECURITY DEFINER function, for the
   * same RLS reason as resolveSession.
   *
   * Returns the password hash, so the caller must not log or return the rows.
   */
  async staffByMobile(mobile: string): Promise<StaffCandidate[]> {
    const rows = await this.db.execute<StaffCandidate>(
      sql`SELECT * FROM auth_staff_by_mobile(${mobile})`,
    );
    return rows as unknown as StaffCandidate[];
  }

  /**
   * Resolve a paired device credential. Untenanted for the same reason as
   * resolveSession, via `auth_resolve_device` (0004_device_pairing.sql).
   */
  async resolveDevice(secretHash: string): Promise<DevicePrincipalRow | null> {
    const rows = await this.db.execute<DevicePrincipalRow>(
      sql`SELECT * FROM auth_resolve_device(${secretHash})`,
    );
    return (rows as unknown as DevicePrincipalRow[])[0] ?? null;
  }

  /**
   * Burn a pairing code and mint the device secret in one statement, so a
   * concurrent second attempt cannot also succeed.
   */
  async redeemPairingCode(
    codeHash: string,
    secretHash: string,
  ): Promise<{ deviceId: string; orgId: string; locationId: string } | null> {
    const rows = await this.db.execute<{ deviceId: string; orgId: string; locationId: string }>(
      sql`SELECT * FROM auth_redeem_pairing_code(${codeHash}, ${secretHash})`,
    );
    return (rows as unknown as { deviceId: string; orgId: string; locationId: string }[])[0] ?? null;
  }

  /** Liveness probe. Deliberately untenanted — see resolveSession. */
  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }
}
