import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CheckInsController } from './checkins.controller.js';
import { CheckInsService } from './checkins.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CheckInsController],
  providers: [CheckInsService],
  exports: [CheckInsService],
})
export class CheckInsModule {}
