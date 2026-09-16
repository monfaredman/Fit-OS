import { describe, expect, it } from 'vitest';
import { clampToPlausible } from './sync.service.js';

const NOW = new Date('2026-09-15T12:00:00Z').getTime();
const iso = (d: Date) => d.toISOString();

describe('clampToPlausible — gym PC clocks are routinely wrong', () => {
  it('accepts a timestamp from a few minutes ago', () => {
    const t = new Date(NOW - 3 * 60_000);
    expect(iso(clampToPlausible(t, NOW))).toBe(iso(t));
  });

  it('accepts one from three days ago — a genuinely long outage', () => {
    const t = new Date(NOW - 3 * 24 * 60 * 60_000);
    expect(iso(clampToPlausible(t, NOW))).toBe(iso(t));
  });

  it('refuses the future beyond the skew allowance', () => {
    // A clock three hours fast would otherwise file check-ins into tomorrow and
    // corrupt both the daily report and every attendance baseline.
    const t = new Date(NOW + 3 * 60 * 60_000);
    expect(clampToPlausible(t, NOW).getTime()).toBe(NOW);
  });

  it('tolerates a small amount of forward skew', () => {
    const t = new Date(NOW + 2 * 60_000);
    expect(iso(clampToPlausible(t, NOW))).toBe(iso(t));
  });

  it('clamps an absurdly old timestamp to the offline window', () => {
    const t = new Date(NOW - 400 * 24 * 60 * 60_000);
    const clamped = clampToPlausible(t, NOW).getTime();
    expect(clamped).toBeGreaterThan(t.getTime());
    expect(clamped).toBeLessThan(NOW);
  });

  it('falls back to now for an unparseable date rather than throwing', () => {
    expect(clampToPlausible(new Date('nonsense'), NOW).getTime()).toBe(NOW);
  });

  it('honours a shorter offline window', () => {
    const t = new Date(NOW - 2 * 24 * 60 * 60_000);
    const clamped = clampToPlausible(t, NOW, 24 * 60 * 60_000).getTime();
    expect(clamped).toBeGreaterThan(t.getTime());
  });
});
