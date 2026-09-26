import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { SyncActor, SyncAuthGuard, type SyncPrincipal } from './sync-auth.guard.js';
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

/**
 * Accepts EITHER a staff bearer token or a paired device credential. A kiosk
 * gets a device credential, which reaches these two endpoints and nothing else
 * — in particular it cannot take a payment.
 */
@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(SyncAuthGuard)
@Controller('v1/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Snapshot deltas by monotonic `rev`. An unknown `since` returns the full set. */
  @Get('snapshot')
  snapshot(@SyncActor() actor: SyncPrincipal, @Query() query: unknown) {
    const q = snapshotQuerySchema.parse(query);
    // A device is pinned to its own location, whatever it asks for.
    return this.sync.snapshot(actor, actor.locationId ?? q.locationId, q.since ?? null);
  }

  /** Flush an offline outbox. Accepted and duplicate are both success. */
  @Post('check-ins')
  flush(@SyncActor() actor: SyncPrincipal, @Body() body: unknown) {
    const b = flushBodySchema.parse(body);
    return this.sync.flush(actor, actor.locationId ?? b.locationId, b.events);
  }
}
