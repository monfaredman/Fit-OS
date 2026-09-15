import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { staffLoginBodySchema, type StaffSessionDto, type StaffRole } from '@gymos/contracts';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { capabilitiesFor } from './permissions.js';
import { StaffAuthGuard, type AuthUser } from './staff-auth.guard.js';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Staff login by mobile + password. Rate-limited per mobile. */
  @Post('staff/login')
  @HttpCode(200)
  login(@Body() body: unknown): Promise<StaffSessionDto> {
    return this.auth.login(staffLoginBodySchema.parse(body));
  }

  /** The current principal plus what this role may do — drives the UI's affordances. */
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return {
      staffId: user.staffId,
      orgId: user.orgId,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      elevated: user.elevated,
      capabilities: capabilitiesFor(user.role as StaffRole),
    };
  }

  @Delete('session')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.orgId, user.sessionId);
  }
}
