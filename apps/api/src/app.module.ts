import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './infra/database.module.js';
import { HealthModule } from './health/health.module.js';

/** Infra first, then features. No ConfigModule — `getConfig()` is imported directly. */
@Module({
  imports: [DatabaseModule, AuthModule, HealthModule],
})
export class AppModule {}
