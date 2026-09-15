import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TenantDb } from '../infra/tenant.db.js';

/**
 * The authenticated principal. Exported from the guard file (Trend convention)
 * so every consumer imports the type from the same place that produces it.
 *
 * `orgId` comes from the session row, never from the request — a client cannot
 * ask to act as another gym.
 */
export interface AuthUser {
  staffId: string;
  orgId: string;
  sessionId: string;
  firstName: string;
  lastName: string;
  role: string;
  /** True while an OTP elevation is still valid (owner-level actions). */
  elevated: boolean;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly db: TenantDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    const principal = await this.db.resolveSession(hashToken(header.slice(7).trim()));
    if (!principal) throw new UnauthorizedException();

    req.user = {
      staffId: principal.staffId,
      orgId: principal.orgId,
      sessionId: principal.sessionId,
      firstName: principal.firstName,
      lastName: principal.lastName,
      role: principal.role,
      elevated:
        principal.elevatedUntil !== null && new Date(principal.elevatedUntil) > new Date(),
    };
    return true;
  }
}
