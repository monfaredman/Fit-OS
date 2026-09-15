import { Global, Module } from '@nestjs/common';
import { AccessSnapshotService } from './access-snapshot.service.js';

/** Global: every write that can change the door decision needs to recompute it. */
@Global()
@Module({ providers: [AccessSnapshotService], exports: [AccessSnapshotService] })
export class AccessModule {}
