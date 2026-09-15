/**
 * Fixed-window rate limiter, in-process.
 *
 * Scope: login and OTP only. Deliberately not Redis-backed — a single API
 * process is the deployment (design/tech-stack.md §8), and an in-memory limiter
 * that works beats a distributed one that is another service to operate. When
 * the API scales horizontally this moves to Redis; the interface stays.
 *
 * Pure enough to unit-test: the clock is injectable.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): RateLimitResult {
    const t = this.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= t) {
      this.windows.set(key, { count: 1, resetAt: t + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterSec: 0 };
    }

    existing.count += 1;
    if (existing.count > this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.ceil((existing.resetAt - t) / 1000),
      };
    }
    return { allowed: true, remaining: this.limit - existing.count, retryAfterSec: 0 };
  }

  /** Called on success so a legitimate login does not burn the attacker's budget. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Drop expired windows. Without this the map grows unbounded. */
  sweep(): void {
    const t = this.now();
    for (const [key, w] of this.windows) if (w.resetAt <= t) this.windows.delete(key);
  }

  get size(): number {
    return this.windows.size;
  }
}
