import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CheckInsModule } from './checkins/checkins.module.js';
import { DatabaseModule } from './infra/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { MoneyModule } from './money/money.module.js';
import { PeopleModule } from './people/people.module.js';
import { SyncModule } from './sync/sync.module.js';

/** Infra first, then features. No ConfigModule — `getConfig()` is imported directly. */
@Module({
  imports: [
    DatabaseModule,
    AccessModule,
    AuthModule,
    PeopleModule,
    MembershipsModule,
    MoneyModule,
    CheckInsModule,
    SyncModule,
    HealthModule,
  ],
})
export class AppModule {}
