/**
 * Password hashing with node's built-in scrypt.
 *
 * Deliberately no argon2/bcrypt dependency: both are native modules, and a
 * native build step on a machine you cannot reach is exactly the kind of
 * install friction that turns into a support call. scrypt is memory-hard, in
 * the standard library, and sufficient here.
 *
 * Stored format: `scrypt$N$r$p$salt_b64$hash_b64` — self-describing, so the
 * parameters can be raised later without invalidating existing hashes.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

/** OWASP-ish baseline. Raise N over time; old hashes keep verifying. */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEYLEN = 32;
const SALT_BYTES = 16;
// scrypt's default maxmem (32MB) is below what N=2^15,r=8 needs.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    ...PARAMS,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Returns false for any malformed stored value
 * rather than throwing — a corrupt hash must read as "wrong password", never as
 * a 500 that tells an attacker the account exists.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64');
    expected = Buffer.from(parts[5]!, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Opaque session token. Stored hashed — never in plaintext (see hashToken). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
