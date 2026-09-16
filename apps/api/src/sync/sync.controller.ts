import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CapabilityGuard, RequireCapability } from '../auth/roles.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';
import { SyncService } from './sync.service.js';

const snapshotQuerySchema = z.object({
  locationId: z.string().uuid(),
  since: z.coerce.number().int().nonnegative().optional(),
});

const flushBodySchema = z.object({
  locationId: z.string().uuid(),
  events: z
    .array(
      z.object({
        clientEventId: z.string().min(8).max(128),
        personId: z.string().uuid(),
        occurredAt: z.string(),
        method: z.string().max(16),
        admitted: z.boolean(),
        denialReason: z.string().max(40).nullable().optional(),
      }),
    )
    .max(200),
});

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, CapabilityGuard)
@Controller('v1/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Snapshot deltas by monotonic `rev`. An unknown `since` returns the full set. */
  @Get('snapshot')
  @RequireCapability('checkin.create')
  snapshot(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = snapshotQuerySchema.parse(query);
    return this.sync.snapshot(user, q.locationId, q.since ?? null);
  }

  /** Flush an offline outbox. Accepted and duplicate are both success. */
  @Post('check-ins')
  @RequireCapability('checkin.create')
  flush(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = flushBodySchema.parse(body);
    return this.sync.flush(user, b.locationId, b.events);
  }
}
