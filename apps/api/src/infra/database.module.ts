import { Global, Module } from '@nestjs/common';
import { getDb, type Database } from '@gymos/db';
import { DB } from './database.tokens.js';
import { TenantDb } from './tenant.db.js';

/**
 * Note what is NOT exported: `DB`. The raw Drizzle handle stays inside this
 * module so nothing outside can run a query without a tenant scope. Services
 * inject `TenantDb` and go through `withOrg`.
 */
@Global()
@Module({
  providers: [{ provide: DB, useFactory: (): Database => getDb() }, TenantDb],
  exports: [TenantDb],
})
export class DatabaseModule {}
