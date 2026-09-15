import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@gymos/contracts';
import { TenantDb } from './tenant.db.js';

/**
 * Minimal Drizzle stand-in. Records the statements executed inside the
 * transaction so we can assert that the tenant is set, not just assume it.
 */
function fakeDb(executed: unknown[]) {
  const tx = {
    execute: vi.fn(async (q: unknown) => {
      executed.push(q);
      return [];
    }),
  };
  return {
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    execute: vi.fn(async () => []),
    _tx: tx,
  };
}

describe('TenantDb', () => {
  it('refuses to run without an org — never a silent untenanted query', async () => {
    const db = new TenantDb(fakeDb([]) as never);
    await expect(db.withOrg('', async () => 'x')).rejects.toBeInstanceOf(AppError);
    await expect(db.withOrg('', async () => 'x')).rejects.toMatchObject({ code: 'NO_TENANT' });
  });

  it('opens exactly one transaction and sets app.org_id inside it', async () => {
    const executed: unknown[] = [];
    const inner = fakeDb(executed);
    const db = new TenantDb(inner as never);

    await db.withOrg('11111111-1111-1111-1111-111111111111', async () => 'ok');

    expect(inner.transaction).toHaveBeenCalledTimes(1);
    expect(executed).toHaveLength(1);
    // The SQL fragment must reference set_config — that is what makes RLS work.
    expect(JSON.stringify(executed[0])).toContain('set_config');
  });

  it('sets the tenant before the callback body runs', async () => {
    const order: string[] = [];
    const tx = {
      execute: vi.fn(async () => {
        order.push('set_config');
        return [];
      }),
    };
    const inner = {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      execute: vi.fn(async () => []),
    };
    const db = new TenantDb(inner as never);

    await db.withOrg('22222222-2222-2222-2222-222222222222', async () => {
      order.push('callback');
      return null;
    });

    expect(order).toEqual(['set_config', 'callback']);
  });

  it('returns the callback result', async () => {
    const db = new TenantDb(fakeDb([]) as never);
    await expect(
      db.withOrg('33333333-3333-3333-3333-333333333333', async () => 42),
    ).resolves.toBe(42);
  });

  it('propagates failures so the transaction rolls back', async () => {
    const db = new TenantDb(fakeDb([]) as never);
    await expect(
      db.withOrg('44444444-4444-4444-4444-444444444444', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('reports false from ping() rather than throwing when the database is down', async () => {
    const inner = {
      transaction: vi.fn(),
      execute: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    };
    const db = new TenantDb(inner as never);
    await expect(db.ping()).resolves.toBe(false);
  });
});
