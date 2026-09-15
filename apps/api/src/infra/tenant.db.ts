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

  /** Liveness probe. Deliberately the only untenanted query in the app. */
  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }
}
