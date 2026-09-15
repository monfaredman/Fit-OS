import { describe, expect, it } from 'vitest';
import { planSearch, rankResults, scoreResult } from './search.js';

const row = (over: Partial<{ mobile: string; memberNo: number | null; searchName: string }> = {}) => ({
  mobile: '9123456789',
  memberNo: 1042 as number | null,
  searchName: 'علی رضایی',
  ...over,
});

describe('planSearch — what did the receptionist mean?', () => {
  it('treats Persian digits exactly like Latin ones', () => {
    // The bug that is invisible until a gym reports "search is broken".
    expect(planSearch('۰۹۱۲۳۴۵۶۷۸۹')).toEqual(planSearch('09123456789'));
    expect(planSearch('۹۱۲۳').kind).toBe('mobile');
  });

  it('reads a full mobile in any of the forms staff type', () => {
    for (const q of ['09123456789', '+989123456789', '9123456789', '0912 345 6789', '0912-345-6789']) {
      const p = planSearch(q);
      expect(p.kind, q).toBe('mobile');
      expect(p.mobileSuffix, q).toBe('9123456789');
    }
  });

  it('treats a 4-digit run starting with 9 as a mobile tail', () => {
    const p = planSearch('9123');
    expect(p.kind).toBe('mobile');
    expect(p.mobileSuffix).toBe('9123');
  });

  it('treats a short digit run as a member number, but keeps the mobile fallback', () => {
    const p = planSearch('1042');
    expect(p.kind).toBe('member_no');
    expect(p.memberNo).toBe(1042);
    // Ambiguous input must not foreclose the other interpretation.
    expect(p.mobileSuffix).toBe('1042');
  });

  it('treats anything else as a name', () => {
    expect(planSearch('علی').kind).toBe('name');
    expect(planSearch('رضایی').kind).toBe('name');
  });

  it('normalises Arabic yeh and kaf so imported names match typed ones', () => {
    const arabic = planSearch('علي رضايي').needle;
    const persian = planSearch('علی رضایی').needle;
    expect(arabic).toBe(persian);
  });

  it('collapses ZWNJ and stray whitespace', () => {
    expect(planSearch('  محمد‌رضا  ').needle).toBe('محمد رضا');
  });
});

describe('scoreResult — ranking', () => {
  it('puts an exact mobile above a suffix match', () => {
    const p = planSearch('09123456789');
    expect(scoreResult(p, row())).toBe(100);
    expect(scoreResult(p, row({ mobile: '9990000000' }))).toBe(10);
  });

  it('scores a mobile tail highly when the run is unambiguously a mobile', () => {
    const p = planSearch('9123');
    expect(p.kind).toBe('mobile');
    expect(scoreResult(p, row({ mobile: '9120009123' }))).toBe(80);
  });

  it('still finds a member by mobile tail when the digits look like a member number', () => {
    // '6789' is genuinely ambiguous — 4 digits not starting with 9. It is
    // classified as a member number, but the mobile fallback still matches and
    // ranks well above a non-match, so the receptionist gets their person.
    const p = planSearch('6789');
    expect(p.kind).toBe('member_no');
    expect(scoreResult(p, row())).toBe(70);
    expect(scoreResult(p, row({ mobile: '9990000000', memberNo: 5 }))).toBe(10);
  });

  it('puts an exact member number first', () => {
    const p = planSearch('1042');
    expect(scoreResult(p, row())).toBe(100);
    expect(scoreResult(p, row({ memberNo: 2000 }))).toBe(10);
  });

  it('ranks exact name, then prefix, then word boundary, then substring', () => {
    const p = planSearch('رضایی');
    expect(scoreResult(p, row({ searchName: 'رضایی' }))).toBe(100);
    expect(scoreResult(p, row({ searchName: 'رضایی نژاد' }))).toBe(80);
    expect(scoreResult(p, row({ searchName: 'علی رضایی' }))).toBe(60);
    expect(scoreResult(p, row({ searchName: 'محمدرضایی‌فر' }))).toBeLessThanOrEqual(60);
  });
});

describe('rankResults', () => {
  it('orders by score then name, so results do not jitter between keystrokes', () => {
    const p = planSearch('علی');
    const rows = [
      row({ searchName: 'محمد علی پور', mobile: '9120000001', memberNo: 1 }),
      row({ searchName: 'علی', mobile: '9120000002', memberNo: 2 }),
      row({ searchName: 'علی رضایی', mobile: '9120000003', memberNo: 3 }),
    ];
    expect(rankResults(p, rows).map((r) => r.searchName)).toEqual([
      'علی',
      'علی رضایی',
      'محمد علی پور',
    ]);
  });

  it('does not mutate the input array', () => {
    const rows = [row({ searchName: 'ب' }), row({ searchName: 'الف' })];
    const before = rows.map((r) => r.searchName);
    rankResults(planSearch('الف'), rows);
    expect(rows.map((r) => r.searchName)).toEqual(before);
  });
});
