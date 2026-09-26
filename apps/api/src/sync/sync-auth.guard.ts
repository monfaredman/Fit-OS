import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { can } from '../auth/permissions.js';
import { DeviceAuthGuard, type DevicePrincipal } from '../auth/device-auth.guard.js';
import { StaffAuthGuard, type AuthUser } from '../auth/staff-auth.guard.js';

/**
 * Whoever is calling the sync endpoints: a signed-in staff member at the Desk,
 * or a paired kiosk.
 *
 * `locationId` is set only for a device, and when it is set it **overrides**
 * whatever the request body claims. A kiosk can therefore only ever read and
 * write its own location's data, regardless of what it asks for.
 */
export interface SyncPrincipal {
  orgId: string;
  /** Present for a device; absent for staff, who may name any of their sites. */
  locationId?: string;
  deviceId?: string;
  staffId?: string;
}

/**
 * Accepts either credential.
 *
 * `Authorization: Device <secret>` → a paired kiosk
 * `Authorization: Bearer <token>`  → staff, who must hold `checkin.create`
 *
 * The distinction matters: a device credential reaches exactly these two
 * endpoints, so the token sitting on an unattended machine in a public room
 * cannot take a payment.
 */
@Injectable()
export class SyncAuthGuard implements CanActivate {
  constructor(
    private readonly staff: StaffAuthGuard,
    private readonly device: DeviceAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
      device?: DevicePrincipal;
      syncActor?: SyncPrincipal;
    }>();

    const header = req.headers.authorization ?? '';

    if (header.startsWith('Device ')) {
      await this.device.canActivate(context);
      const d = req.device!;
      req.syncActor = { orgId: d.orgId, locationId: d.locationId, deviceId: d.deviceId };
      return true;
    }

    await this.staff.canActivate(context);
    const u = req.user!;
    if (!can(u.role as never, 'checkin.create')) throw new UnauthorizedException();
    req.syncActor = { orgId: u.orgId, staffId: u.staffId };
    return true;
  }
}

export const SyncActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SyncPrincipal => {
    const req = ctx.switchToHttp().getRequest<{ syncActor?: SyncPrincipal }>();
    if (!req.syncActor) throw new Error('SyncActor used without SyncAuthGuard');
    return req.syncActor;
  },
);
