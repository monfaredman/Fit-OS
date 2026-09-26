import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SyncAuthGuard } from './sync-auth.guard.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SyncController],
  providers: [SyncService, SyncAuthGuard],
  exports: [SyncService],
})
export class SyncModule {}
