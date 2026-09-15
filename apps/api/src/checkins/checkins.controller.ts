import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  checkInsQuerySchema,
  createCheckInBodySchema,
  type CheckInResultDto,
} from '@gymos/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CapabilityGuard, RequireCapability } from '../auth/roles.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';
import { CheckInsService } from './checkins.service.js';

@ApiTags('check-ins')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, CapabilityGuard)
@Controller('v1')
export class CheckInsController {
  constructor(private readonly checkins: CheckInsService) {}

  /**
   * Admit or refuse. The decision comes from the precomputed snapshot, so this
   * endpoint and a disconnected kiosk can never disagree. A replayed
   * `clientEventId` returns the original result with `duplicate: true`.
   */
  @Post('check-ins')
  @RequireCapability('checkin.create')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<CheckInResultDto> {
    return this.checkins.create(user, createCheckInBodySchema.parse(body));
  }

  @Get('check-ins')
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.checkins.list(user, checkInsQuerySchema.parse(query));
  }
}
