import { describe, expect, it } from 'vitest';
import { decideReplay, hashRequest, expiresAt, IDEMPOTENCY_TTL_MS } from './idempotency.js';

describe('hashRequest', () => {
  it('is stable regardless of key order', () => {
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
  });
  it('changes when a value changes', () => {
    expect(hashRequest({ amountRial: 100 })).not.toBe(hashRequest({ amountRial: 101 }));
  });
  it('distinguishes nested differences', () => {
    expect(hashRequest({ a: { b: 1 } })).not.toBe(hashRequest({ a: { b: 2 } }));
  });
  it('handles arrays, null and undefined', () => {
    expect(hashRequest([1, 2])).toBe(hashRequest([1, 2]));
    expect(hashRequest([2, 1])).not.toBe(hashRequest([1, 2]));
    expect(hashRequest(null)).toBe(hashRequest(null));
  });
});

describe('decideReplay', () => {
  const stored = { requestHash: 'abc', responseStatus: 201, responseBody: { id: 'x' } };

  it('proceeds when the key has never been seen', () => {
    expect(decideReplay(null, 'abc')).toEqual({ kind: 'proceed' });
  });

  it('replays the stored response for an identical retry — never re-executes', () => {
    // The receptionist pressed the button twice on a flaky connection.
    expect(decideReplay(stored, 'abc')).toEqual({
      kind: 'replay', status: 201, body: { id: 'x' },
    });
  });

  it('refuses a different body under the same key', () => {
    // That is a client bug, not a retry. Silently executing it would be the
    // worst of the three outcomes.
    expect(decideReplay(stored, 'different')).toEqual({ kind: 'conflict' });
  });
});

describe('expiry', () => {
  it('lives 24 hours — long enough for any retry, short enough to stay small', () => {
    const now = new Date('2026-09-15T00:00:00Z');
    expect(expiresAt(now).getTime() - now.getTime()).toBe(IDEMPOTENCY_TTL_MS);
    expect(IDEMPOTENCY_TTL_MS).toBe(86_400_000);
  });
});
