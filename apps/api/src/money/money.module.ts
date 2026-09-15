import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MoneyController } from './money.controller.js';
import { MoneyService } from './money.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MoneyController],
  providers: [MoneyService],
  exports: [MoneyService],
})
export class MoneyModule {}
