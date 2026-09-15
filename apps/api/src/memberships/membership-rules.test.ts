import { describe, expect, it } from 'vitest';
import { fromJalali, formatJalaliLatin } from '@gymos/core';
import {
  computeEndsAt, consumesSession, decideAccess, extendForFreeze,
  freezeDaysCredited, renewalStart, sessionsRemaining,
  type MembershipLike, type PlanLike,
} from './membership-rules.js';

const plan = (over: Partial<PlanLike> = {}): PlanLike => ({
  kind: 'session_count', durationDays: 30, sessionCount: 12, ...over,
});
const mem = (over: Partial<MembershipLike> = {}): MembershipLike => ({
  status: 'active',
  startsAt: new Date('2026-09-01T06:00:00Z'),
  endsAt: new Date('2026-12-01T06:00:00Z'),
  sessionsTotal: 12,
  sessionsUsed: 3,
  ...over,
});

describe('expiry arithmetic crosses Jalali month boundaries correctly', () => {
  it('adds 30 days across a 31-day month (Shahrivar)', () => {
    // 1405/06/15 + 30d is 07/14, NOT 07/15 — Shahrivar has 31 days.
    const end = computeEndsAt(plan({ durationDays: 30 }), fromJalali(1405, 6, 15));
    expect(formatJalaliLatin(end!)).toBe('1405/07/14');
  });

  it('adds 30 days across a 30-day month (Mehr)', () => {
    const end = computeEndsAt(plan({ durationDays: 30 }), fromJalali(1405, 7, 15));
    expect(formatJalaliLatin(end!)).toBe('1405/08/15');
  });

  it('crosses the year boundary at a 29-day Esfand', () => {
    const end = computeEndsAt(plan({ durationDays: 5 }), fromJalali(1405, 12, 27));
    expect(formatJalaliLatin(end!)).toBe('1406/01/03');
  });

  it('handles a 90-day plan — which is NOT three months', () => {
    // Farvardin, Ordibehesht and Khordad are 31 days each, so 90 days from
    // 01/01 lands on 03/29. Anyone reaching for "+3 months" ships a membership
    // that expires two days early, every single time.
    const end = computeEndsAt(plan({ durationDays: 90 }), fromJalali(1405, 1, 1));
    expect(formatJalaliLatin(end!)).toBe('1405/03/29');
  });

  it('a 90-day plan starting in a 30-day month lands differently again', () => {
    // From Mehr (30 days): 07/01 + 90 = 10/02, because Mehr/Aban/Azar are 30.
    const end = computeEndsAt(plan({ durationDays: 90 }), fromJalali(1405, 7, 1));
    expect(formatJalaliLatin(end!)).toBe('1405/10/01');
  });

  it('never expires an open plan', () => {
    expect(computeEndsAt(plan({ kind: 'open', durationDays: null }), new Date())).toBeNull();
  });
});

describe('freeze credit', () => {
  it('credits whole calendar days lost', () => {
    expect(freezeDaysCredited(fromJalali(1405, 7, 1), fromJalali(1405, 7, 8))).toBe(7);
  });

  it('credits zero for a same-day freeze — no access was lost', () => {
    expect(freezeDaysCredited(fromJalali(1405, 7, 1), fromJalali(1405, 7, 1))).toBe(0);
  });

  it('never credits negative days', () => {
    expect(freezeDaysCredited(fromJalali(1405, 7, 8), fromJalali(1405, 7, 1))).toBe(0);
  });

  it('pushes the end date out by exactly the days credited, across a month end', () => {
    const extended = extendForFreeze(fromJalali(1405, 6, 29), 5);
    // 06/29 + 5 = 07/03 (Shahrivar has 31 days)
    expect(formatJalaliLatin(extended!)).toBe('1405/07/03');
  });

  it('leaves an open plan open', () => {
    expect(extendForFreeze(null, 10)).toBeNull();
  });
});

describe('sessions', () => {
  it('counts what is left', () => {
    expect(sessionsRemaining(mem())).toBe(9);
  });
  it('never goes negative', () => {
    expect(sessionsRemaining(mem({ sessionsUsed: 99 }))).toBe(0);
  });
  it('returns null for unlimited plans', () => {
    expect(sessionsRemaining(mem({ sessionsTotal: null }))).toBeNull();
  });
  it('only counts sessions on plans that have them', () => {
    expect(consumesSession(plan({ kind: 'session_count' }))).toBe(true);
    expect(consumesSession(plan({ kind: 'hybrid' }))).toBe(true);
    expect(consumesSession(plan({ kind: 'duration' }))).toBe(false);
    expect(consumesSession(plan({ kind: 'open' }))).toBe(false);
  });
});

describe('the door decision', () => {
  const base = { arrearsRial: 0, policy: 'warn' as const, graceRial: 500_000 };

  it('admits an active member', () => {
    expect(decideAccess({ ...base, membership: mem() })).toMatchObject({
      canEnter: true, reasonCode: 'ok', sessionsRemaining: 9,
    });
  });

  it('refuses when there is no membership at all', () => {
    expect(decideAccess({ ...base, membership: null }).reasonCode).toBe('no_membership');
  });

  it('reports structural reasons before money — the receptionist needs the right path', () => {
    // A member whose subscription ran out is not "in arrears", even if they owe.
    const expired = mem({ endsAt: new Date('2020-01-01T00:00:00Z') });
    expect(decideAccess({ ...base, membership: expired, arrearsRial: 9_000_000 }).reasonCode)
      .toBe('expired');

    const frozen = mem({ status: 'frozen' });
    expect(decideAccess({ ...base, membership: frozen, arrearsRial: 9_000_000 }).reasonCode)
      .toBe('frozen');

    const spent = mem({ sessionsUsed: 12 });
    expect(decideAccess({ ...base, membership: spent, arrearsRial: 9_000_000 }).reasonCode)
      .toBe('no_sessions');
  });

  it('warns but admits by default when a member owes money', () => {
    const d = decideAccess({ ...base, membership: mem(), arrearsRial: 4_200_000 });
    expect(d.canEnter).toBe(true);
    expect(d.reasonCode).toBe('ok');
  });

  it('blocks on arrears when the org chose to, but only above the grace threshold', () => {
    const blocking = { ...base, policy: 'block' as const, membership: mem() };
    expect(decideAccess({ ...blocking, arrearsRial: 400_000 }).canEnter).toBe(true);
    expect(decideAccess({ ...blocking, arrearsRial: 4_200_000 }).canEnter).toBe(false);
    expect(decideAccess({ ...blocking, arrearsRial: 4_200_000 }).reasonCode).toBe('arrears');
  });

  it('treats a cancelled membership as none', () => {
    expect(decideAccess({ ...base, membership: mem({ status: 'cancelled' }) }).reasonCode)
      .toBe('no_membership');
  });

  it('admits an unlimited plan with no session count', () => {
    const d = decideAccess({ ...base, membership: mem({ sessionsTotal: null, sessionsUsed: 0 }) });
    expect(d.canEnter).toBe(true);
    expect(d.sessionsRemaining).toBeNull();
  });
});

describe('renewal start', () => {
  it('starts the day after the current period ends', () => {
    const end = fromJalali(1405, 7, 30);
    const now = fromJalali(1405, 7, 25);
    expect(formatJalaliLatin(renewalStart(end, now))).toBe('1405/08/01');
  });

  it('starts today when the membership already lapsed', () => {
    const end = fromJalali(1405, 6, 1);
    const now = fromJalali(1405, 7, 25);
    expect(formatJalaliLatin(renewalStart(end, now))).toBe('1405/07/25');
  });

  it('starts today for an open plan', () => {
    const now = fromJalali(1405, 7, 25);
    expect(formatJalaliLatin(renewalStart(null, now))).toBe('1405/07/25');
  });
});
