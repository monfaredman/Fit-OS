import { describe, expect, it } from 'vitest';
import { loadConfig, envSchema } from './index.js';

const base = {
  DATABASE_URL: 'postgres://gymos:gymos@localhost:5433/gymos',
  SESSION_SECRET: 'test-secret-0123456789',
} as unknown as NodeJS.ProcessEnv;

describe('config', () => {
  it('applies defaults for everything optional', () => {
    const c = loadConfig({ ...base });
    expect(c.PORT).toBe(3000);
    expect(c.DEFAULT_TIMEZONE).toBe('Asia/Tehran');
    expect(c.ARREARS_GRACE_RIAL).toBe(500_000);
    expect(c.SEED_MEMBER_COUNT).toBe(600);
  });

  it('coerces numeric strings from the environment', () => {
    const c = loadConfig({ ...base, PORT: '4000', SEED_MEMBER_COUNT: '120' } as NodeJS.ProcessEnv);
    expect(c.PORT).toBe(4000);
    expect(c.SEED_MEMBER_COUNT).toBe(120);
  });

  it('lists every problem at once rather than failing on the first', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      /DATABASE_URL[\s\S]*SESSION_SECRET|SESSION_SECRET[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects the dev session secret in production', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        SESSION_SECRET: 'dev-only-change-me-0123456789abcdef',
        DATABASE_APP_URL: 'postgres://gymos_app:x@localhost:5433/gymos',
      } as NodeJS.ProcessEnv),
    ).toThrow(/development default/);
  });

  it('requires a non-owner database role in production (D-004)', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-real-production-secret-value',
      } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_APP_URL is required/);
  });

  it('keeps ARREARS_GRACE_RIAL an integer — money is never fractional', () => {
    expect(envSchema.safeParse({ ...base, ARREARS_GRACE_RIAL: '1.5' }).success).toBe(false);
  });
});
