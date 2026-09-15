import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './infra/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { MoneyModule } from './money/money.module.js';
import { PeopleModule } from './people/people.module.js';

/** Infra first, then features. No ConfigModule — `getConfig()` is imported directly. */
@Module({
  imports: [
    DatabaseModule,
    AccessModule,
    AuthModule,
    PeopleModule,
    MembershipsModule,
    MoneyModule,
    HealthModule,
  ],
})
export class AppModule {}
