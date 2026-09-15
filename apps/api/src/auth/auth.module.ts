import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CapabilityGuard } from './roles.guard.js';
import { StaffAuthGuard } from './staff-auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, StaffAuthGuard, CapabilityGuard],
  exports: [AuthService, StaffAuthGuard, CapabilityGuard],
})
export class AuthModule {}
