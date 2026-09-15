import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { HealthDto } from '@gymos/contracts';
import { TenantDb } from '../infra/tenant.db.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly db: TenantDb) {}

  /** Liveness + database reachability. Used by the uptime check in operations.md. */
  @Get('health')
  async health(): Promise<HealthDto> {
    const db = await this.db.ping();
    return {
      status: db ? 'ok' : 'degraded',
      db,
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
