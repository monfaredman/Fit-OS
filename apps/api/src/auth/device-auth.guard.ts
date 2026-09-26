import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { TenantDb } from '../infra/tenant.db.js';

/**
 * A paired device. Note what is absent: no `staffId`, no role, no capabilities.
 *
 * A kiosk sits unattended in a public room. Its credential must be able to pull
 * snapshots and flush check-ins, and nothing else — in particular it must never
 * be able to take a payment, which a staff token can.
 */
export interface DevicePrincipal {
  deviceId: string;
  orgId: string;
  locationId: string;
  kind: string;
  label: string | null;
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Six digits, grouped for reading aloud over a phone: `482 901`.
 *
 * Short because an installer types it once under time pressure; safe because it
 * lives ten minutes, is single-use, and is burned by the redeem statement
 * itself rather than by application code.
 */
export function generatePairingCode(): string {
  const n = randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString('base64url');
}

export const PAIRING_TTL_MS = 10 * 60_000;

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly db: TenantDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      device?: DevicePrincipal;
    }>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Device ')) throw new UnauthorizedException();

    const principal = await this.db.resolveDevice(hashSecret(header.slice(7).trim()));
    if (!principal) throw new UnauthorizedException();

    req.device = principal;
    return true;
  }
}
