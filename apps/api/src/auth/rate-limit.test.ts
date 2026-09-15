import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  it('allows up to the limit then blocks', () => {
    let t = 0;
    const rl = new RateLimiter(3, 60_000, () => t);
    expect(rl.hit('9121111111').allowed).toBe(true);
    expect(rl.hit('9121111111').allowed).toBe(true);
    expect(rl.hit('9121111111').allowed).toBe(true);
    const blocked = rl.hit('9121111111');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
  });

  it('keys independently so one mobile cannot lock out another', () => {
    let t = 0;
    const rl = new RateLimiter(1, 60_000, () => t);
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
    expect(rl.hit('b').allowed).toBe(true);
  });

  it('opens a fresh window once the old one expires', () => {
    let t = 0;
    const rl = new RateLimiter(1, 1_000, () => t);
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
    t = 1_001;
    expect(rl.hit('a').allowed).toBe(true);
  });

  it('resets on success so a real login does not burn the budget', () => {
    let t = 0;
    const rl = new RateLimiter(2, 60_000, () => t);
    rl.hit('a');
    rl.reset('a');
    expect(rl.hit('a').remaining).toBe(1);
  });

  it('sweeps expired windows so the map does not grow unbounded', () => {
    let t = 0;
    const rl = new RateLimiter(5, 1_000, () => t);
    rl.hit('a');
    rl.hit('b');
    expect(rl.size).toBe(2);
    t = 2_000;
    rl.sweep();
    expect(rl.size).toBe(0);
  });
});
