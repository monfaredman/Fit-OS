/**
 * Database client. postgres.js, not `pg` — matching the Vieral/Trend convention.
 *
 * Two connections exist for a reason (D-004):
 *   - the OWNER url runs migrations and the seed
 *   - the APP url is a NOBYPASSRLS role used by the API
 * A table owner silently bypasses every RLS policy, which is how RLS ends up
 * enabled and doing nothing at all.
 */

import { appDatabaseUrl, getConfig } from '@gymos/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

let memoized: Database | undefined;

/** Memoized application connection (RLS-enforced role). */
export function getDb(connectionString?: string): Database {
  if (memoized && !connectionString) return memoized;
  const url = connectionString ?? appDatabaseUrl(getConfig());
  const client = postgres(url, { max: 10, connect_timeout: 5 });
  const db = drizzle(client, { schema });
  if (!connectionString) memoized = db;
  return db;
}

/** Fresh, unmemoized client — used by migrate and seed scripts. */
export function createDb(connectionString: string): {
  db: Database;
  sql: postgres.Sql;
  close: () => Promise<void>;
} {
  const sql = postgres(connectionString, { max: 1 });
  return { db: drizzle(sql, { schema }), sql, close: () => sql.end({ timeout: 5 }) };
}

export async function closeDb(): Promise<void> {
  memoized = undefined;
}
