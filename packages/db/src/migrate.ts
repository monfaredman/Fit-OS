/**
 * Run migrations as the OWNER role, then ensure the application role exists.
 *
 * `0001_guards.sql` is hand-written and permanent — RLS policies, the ledger
 * balance constraint, the append-only triggers. `drizzle-kit generate` must
 * never regenerate or overwrite it (D-005).
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '@gymos/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, close } = createDb(config.DATABASE_URL);
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/migrate.js → ../drizzle  |  src/migrate.ts → ../drizzle
  const migrationsFolder = resolve(here, '..', 'drizzle');

  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied.');
  await close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
