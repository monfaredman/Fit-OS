/**
 * Every amount and date in the UI goes through here.
 *
 * `@gymos/core` is the only place money and dates are formatted (CLAUDE.md
 * invariants 1 and 5). These are thin wrappers so no component ever reaches for
 * a date library or divides by ten itself.
 */

import { formatToman, toPersianDigits, normalizeDigits } from '@gymos/core/money';
import { formatJalali } from '@gymos/core/jalali';

/** Integer Rial → «۲٬۵۰۰٬۰۰۰ تومان». Never show a Rial figure to a user. */
export const toman = (rial: number): string => formatToman(rial);

/** Integer Rial → «۲٬۵۰۰٬۰۰۰» without the suffix, for table cells. */
export const tomanBare = (rial: number): string => formatToman(rial, { suffix: false });

/** ISO string → «۱۴۰۵/۰۷/۰۵». Never show a Gregorian date to anyone. */
export const jalali = (iso: string | null): string => (iso ? formatJalali(new Date(iso)) : '—');

export const faNum = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : toPersianDigits(String(n));

/** Accept Persian and Latin digits from any numeric input (invariant 6). */
export const parseAmountToman = (raw: string): number | null => {
  const cleaned = normalizeDigits(raw).replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned) * 10; // Toman in, Rial out
};

export const mobileFa = (normalized: string): string => toPersianDigits('0' + normalized);
