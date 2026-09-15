import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@gymos/contracts';
import { can, type Capability } from './permissions.js';
import type { AuthUser } from './staff-auth.guard.js';

export const REQUIRED_CAPABILITY = 'gymos:capability';

/** Declare what a route needs: `@RequireCapability('arrears.writeoff')`. */
export const RequireCapability = (capability: Capability): MethodDecorator =>
  SetMetadata(REQUIRED_CAPABILITY, capability);

/**
 * Must run **after** StaffAuthGuard, which populates `req.user`.
 * Use as `@UseGuards(StaffAuthGuard, CapabilityGuard)`.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Capability | undefined>(
      REQUIRED_CAPABILITY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user) throw new UnauthorizedException();
    if (!can(req.user.role as StaffRole, required)) throw new ForbiddenException();
    return true;
  }
}
