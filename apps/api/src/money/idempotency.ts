/**
 * Idempotency for money-moving endpoints (design/api-design.md §4).
 *
 * Why this matters more here than anywhere else: a receptionist on a flaky
 * connection **will** press «دریافت وجه» twice. Without a replay store the
 * member's arrears is wrong and the drawer will not balance at close — and
 * nobody notices until the end of the shift.
 *
 * The hashing and the replay decision are pure, so they can be tested without a
 * database; only the read/write of the store touches Postgres.
 */

import { createHash } from 'node:crypto';

/** Stable hash of a request body — key order must not change the result. */
export function hashRequest(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Extends Record so drizzle's `execute<T>` accepts it as a row type. */
export interface StoredResponse extends Record<string, unknown> {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}

export type ReplayDecision =
  | { kind: 'proceed' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'conflict' };

/**
 * Decide what to do with an incoming request given what is already stored.
 *
 * A repeat with the *same* body replays the stored response and does not
 * re-execute. A repeat with a *different* body under the same key is a client
 * bug, not a retry, and must be refused — silently executing it would be the
 * worst outcome of the three.
 */
export function decideReplay(
  stored: StoredResponse | null,
  incomingHash: string,
): ReplayDecision {
  if (!stored) return { kind: 'proceed' };
  if (stored.requestHash !== incomingHash) return { kind: 'conflict' };
  return { kind: 'replay', status: stored.responseStatus, body: stored.responseBody };
}

/** Keys live 24 hours — long enough for any retry, short enough to stay small. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;

export function expiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
}
