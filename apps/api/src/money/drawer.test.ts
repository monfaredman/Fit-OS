import { describe, expect, it } from 'vitest';
import { computeVariance, describeVariance, DEFAULT_TOLERANCE_RIAL } from './drawer.js';

describe('computeVariance', () => {
  it('reports balanced when counted matches expected', () => {
    expect(computeVariance({ expectedRial: 12_450_000, countedRial: 12_450_000 }))
      .toMatchObject({ varianceRial: 0, severity: 'balanced', short: false });
  });

  it('treats a small difference as rounding, not a signal', () => {
    const v = computeVariance({ expectedRial: 12_450_000, countedRial: 12_445_000 });
    expect(v.severity).toBe('balanced');
    expect(v.short).toBe(true);
  });

  it('flags a shortfall — the direction that matters', () => {
    const v = computeVariance({ expectedRial: 12_450_000, countedRial: 10_450_000 });
    expect(v.varianceRial).toBe(-2_000_000);
    expect(v.short).toBe(true);
    expect(v.severity).toBe('significant');
  });

  it('flags a surplus too — it usually means amounts are recorded wrongly', () => {
    const v = computeVariance({ expectedRial: 12_450_000, countedRial: 14_450_000 });
    expect(v.short).toBe(false);
    expect(v.severity).toBe('significant');
  });

  it('grades minor between the tolerance and ten times it', () => {
    expect(computeVariance({ expectedRial: 1_000_000, countedRial: 1_000_000 - 50_000 }).severity)
      .toBe('minor');
    expect(computeVariance({ expectedRial: 1_000_000, countedRial: 1_000_000 - 200_000 }).severity)
      .toBe('significant');
  });

  it('honours a per-org tolerance', () => {
    const v = computeVariance({ expectedRial: 1_000_000, countedRial: 900_000, toleranceRial: 200_000 });
    expect(v.severity).toBe('balanced');
  });

  it('defaults tolerance to 1,000 Toman', () => {
    expect(DEFAULT_TOLERANCE_RIAL).toBe(10_000);
  });
});

describe('describeVariance', () => {
  it('says balanced in Persian', () => {
    expect(describeVariance(computeVariance({ expectedRial: 100, countedRial: 100 })))
      .toBe('صندوق تراز است.');
  });

  it('reports a shortfall in Toman, not Rial', () => {
    // 2,000,000 Rial short is 200,000 Toman. Showing Rial to a human reads as
    // a tenfold error.
    const msg = describeVariance(computeVariance({ expectedRial: 12_450_000, countedRial: 10_450_000 }));
    expect(msg).toBe('کسری صندوق: 200,000 تومان');
  });

  it('reports a surplus distinctly', () => {
    const msg = describeVariance(computeVariance({ expectedRial: 10_450_000, countedRial: 12_450_000 }));
    expect(msg).toBe('اضافه صندوق: 200,000 تومان');
  });
});
