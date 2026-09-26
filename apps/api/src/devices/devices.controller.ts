import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CapabilityGuard, RequireCapability } from '../auth/roles.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';
import { DevicesService } from './devices.service.js';

const pairCodeBody = z.object({
  locationId: z.string().uuid(),
  kind: z.enum(['kiosk', 'bridge', 'scanner']).default('kiosk'),
  label: z.string().max(64).optional(),
});

const redeemBody = z.object({ code: z.string().regex(/^\d{6}$/) });

@ApiTags('devices')
@Controller('v1')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /**
   * Redeem a pairing code. **Deliberately unauthenticated** — the device has no
   * credential yet, which is the point. Single-use, ten-minute expiry, and an
   * expired / wrong / already-used code all return the same error so the
   * endpoint cannot be used to discover which codes exist.
   */
  @Post('auth/device/pair')
  @HttpCode(200)
  redeem(@Body() body: unknown) {
    return this.devices.redeem(redeemBody.parse(body).code);
  }

  @Post('devices/pair-code')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, CapabilityGuard)
  @RequireCapability('org.manage')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = pairCodeBody.parse(body);
    return this.devices.createPairingCode(user, b.locationId, b.kind, b.label);
  }

  @Get('devices')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, CapabilityGuard)
  @RequireCapability('org.manage')
  list(@CurrentUser() user: AuthUser) {
    return this.devices.list(user);
  }

  @Delete('devices/:id')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, CapabilityGuard)
  @RequireCapability('org.manage')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.devices.revoke(user, id);
  }
}
