import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createMembershipBodySchema,
  freezeMembershipBodySchema,
  unfreezeMembershipBodySchema,
  type PlanDto,
} from '@gymos/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CapabilityGuard, RequireCapability } from '../auth/roles.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, CapabilityGuard)
@Controller('v1')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('plans')
  plans(@CurrentUser() user: AuthUser): Promise<PlanDto[]> {
    return this.memberships.listPlans(user);
  }

  /** Sells the membership and posts a balanced membership_sale transaction. */
  @Post('memberships')
  @RequireCapability('membership.sell')
  sell(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<{ id: string }> {
    return this.memberships.sell(user, createMembershipBodySchema.parse(body));
  }

  @Post('memberships/:id/freeze')
  @RequireCapability('membership.freeze')
  @HttpCode(204)
  freeze(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.memberships.freeze(user, id, freezeMembershipBodySchema.parse(body ?? {}));
  }

  @Post('memberships/:id/unfreeze')
  @RequireCapability('membership.freeze')
  @HttpCode(204)
  unfreeze(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.memberships.unfreeze(user, id, unfreezeMembershipBodySchema.parse(body ?? {}));
  }

  @Post('memberships/:id/renew')
  @RequireCapability('membership.sell')
  renew(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { planId?: string } | undefined,
  ): Promise<{ id: string }> {
    return this.memberships.renew(user, id, body?.planId);
  }
}
