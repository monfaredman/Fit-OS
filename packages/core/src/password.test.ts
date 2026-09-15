import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    await expect(verifyPassword('wrong horse battery', hash)).resolves.toBe(false);
  });

  it('salts — the same password hashes differently every time', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    await expect(verifyPassword('same', a)).resolves.toBe(true);
    await expect(verifyPassword('same', b)).resolves.toBe(true);
  });

  it('is self-describing so parameters can be raised later', async () => {
    const hash = await hashPassword('x');
    expect(hash.split('$')).toHaveLength(6);
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('returns false for a missing or corrupt hash rather than throwing', async () => {
    // A 500 here would tell an attacker the account exists.
    await expect(verifyPassword('x', null)).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'garbage')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$1$2$3$4')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$8$1$aaa$bbb')).resolves.toBe(false);
  });

  it('handles Persian passwords and normalises unicode', async () => {
    const hash = await hashPassword('رمزعبور');
    await expect(verifyPassword('رمزعبور', hash)).resolves.toBe(true);
  });
});

describe('session tokens', () => {
  it('are long, url-safe and unique', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
