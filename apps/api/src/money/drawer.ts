/**
 * Cash drawer variance — pure, so the arithmetic that accuses someone of
 * skimming is testable and readable.
 *
 * design/permissions.md §2: receptionists cannot write off arrears, but the
 * simplest attack needs no write-off at all — take the cash, never record the
 * payment, let the member show as in arrears and be chased. A per-shift variance
 * is what closes it.
 *
 * Expected is always DERIVED from the ledger. The person being measured supplies
 * exactly one number: what they counted.
 */

export interface VarianceInput {
  expectedRial: number;
  countedRial: number;
  /** Below this, a difference is rounding, not a signal. Integer Rial. */
  toleranceRial?: number;
}

export type VarianceSeverity = 'balanced' | 'minor' | 'significant';

export interface Variance {
  varianceRial: number;
  severity: VarianceSeverity;
  /** True when there is less cash than the ledger says — the direction that matters. */
  short: boolean;
}

/** Default tolerance: 10,000 Rial (1,000 Toman). Miscounted change, not theft. */
export const DEFAULT_TOLERANCE_RIAL = 10_000;

/**
 * `variance = counted − expected`. Negative means short.
 *
 * Both directions are reported. A consistent *surplus* is as much a signal as a
 * shortfall — it usually means payments are being recorded at the wrong amount.
 */
export function computeVariance(input: VarianceInput): Variance {
  const tolerance = input.toleranceRial ?? DEFAULT_TOLERANCE_RIAL;
  const varianceRial = input.countedRial - input.expectedRial;
  const magnitude = Math.abs(varianceRial);

  const severity: VarianceSeverity =
    magnitude <= tolerance ? 'balanced' : magnitude <= tolerance * 10 ? 'minor' : 'significant';

  return { varianceRial, severity, short: varianceRial < 0 };
}

/**
 * Persian summary for the close screen.
 *
 * Framed as reconciliation, never accusation — `design/permissions.md` §2 is
 * explicit that this is sold as «صندوق هر شب درست بسته می‌شود», not as
 * anti-theft tooling. Iranian gym owners often employ family.
 */
export function describeVariance(v: Variance): string {
  if (v.severity === 'balanced') return 'صندوق تراز است.';
  const amount = Math.abs(v.varianceRial) / 10;
  const formatted = amount.toLocaleString('en-US');
  return v.short
    ? `کسری صندوق: ${formatted} تومان`
    : `اضافه صندوق: ${formatted} تومان`;
}
