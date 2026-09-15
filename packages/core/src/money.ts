/**
 * Money — Rial is the only stored unit. Toman is display only.
 *
 * 1 Toman = 10 Rial. PSPs, banks and سامانه مودیان speak Rial; gyms and members
 * speak Toman. Storing Toman means converting at every PSP boundary and
 * eventually getting one of them wrong.
 *
 * No floats anywhere. All scaling is done on digit strings.
 */

/** Integer Rial. The only unit that is ever persisted. */
export type Rial = number

const PERSIAN_ZERO = 0x06f0 // ۰
const ARABIC_ZERO = 0x0660 // ٠

const THOUSANDS_SEP = '٬' // ٬ ARABIC THOUSANDS SEPARATOR
const DECIMAL_SEP = '٫' // ٫ ARABIC DECIMAL SEPARATOR

const LATIN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const

/**
 * Convert Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Latin.
 *
 * Staff switch keyboard layouts constantly; both forms arrive in the same field
 * within the same shift. Run this on every numeric input and before every
 * search — see receptionist-flow.md §6.
 */
export function normalizeDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const code = ch.codePointAt(0)!
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      out += String(code - PERSIAN_ZERO)
    } else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) {
      out += String(code - ARABIC_ZERO)
    } else {
      out += ch
    }
  }
  return out
}

/** Render Latin digits as Persian. Display only — never store the result. */
export function toPersianDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const d = ch.charCodeAt(0) - 48
    out += d >= 0 && d <= 9 ? LATIN_DIGITS[d]! : ch
  }
  return out
}

/**
 * Parse a Toman amount typed by a human into Rial.
 *
 * Tolerates: Persian/Arabic digits, `٬` and `,` separators, spaces, ZWNJ, a
 * trailing تومان/ريال word, and a decimal part. Rejects anything else rather
 * than guessing — a silently mis-parsed amount reaches a member's phone.
 *
 * @throws if the input is not a well-formed non-negative amount
 */
export function parseTomanInput(input: string): Rial {
  const cleaned = normalizeDigits(input)
    .replace(/[‌‏‎\s]/g, '') // ZWNJ + bidi marks + whitespace
    .replace(/تومان|تومن|ريال|ریال/g, '')
    .replace(new RegExp(`[${THOUSANDS_SEP},]`, 'g'), '')
    .replace(new RegExp(DECIMAL_SEP, 'g'), '.')

  if (cleaned === '') throw new Error('empty amount')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`not a valid amount: ${JSON.stringify(input)}`)
  }

  // ×10 by shifting the decimal point one place right, as a string, so that
  // e.g. 1500.5 Toman becomes exactly 15005 Rial with no float involved.
  const [whole = '', frac = ''] = cleaned.split('.')
  const shifted = whole + (frac[0] ?? '0')
  const rest = frac.slice(1)
  if (/[1-9]/.test(rest)) {
    throw new Error(`amount is finer than 1 Rial: ${JSON.stringify(input)}`)
  }

  const rial = Number(shifted)
  if (!Number.isSafeInteger(rial)) throw new Error('amount out of range')
  return rial
}

/** Exact Toman → Rial. Input must be an integer count of Toman. */
export function tomanToRial(toman: number): Rial {
  if (!Number.isInteger(toman)) throw new Error('toman must be an integer')
  return toman * 10
}

/**
 * Format Rial as a Toman string with Persian digits and `٬` separators.
 *
 * Amounts not divisible by 10 keep their Rial remainder as a decimal rather
 * than being rounded — rounding money silently is how ledgers stop balancing.
 */
export function formatToman(rial: Rial, opts?: { suffix?: boolean }): string {
  if (!Number.isSafeInteger(rial)) throw new Error('rial must be a safe integer')
  const neg = rial < 0
  const abs = Math.abs(rial)

  const whole = Math.trunc(abs / 10)
  const remainder = abs % 10

  let s = groupThousands(String(whole), THOUSANDS_SEP)
  if (remainder !== 0) s += DECIMAL_SEP + String(remainder)
  if (neg) s = '−' + s // real minus sign, not a hyphen

  const out = toPersianDigits(s)
  return opts?.suffix === false ? out : `${out} تومان`
}

/** Latin-digit Toman, for logs, CSV exports and test assertions. */
export function formatTomanLatin(rial: Rial): string {
  const neg = rial < 0
  const abs = Math.abs(rial)
  const whole = Math.trunc(abs / 10)
  const remainder = abs % 10
  let s = groupThousands(String(whole), ',')
  if (remainder !== 0) s += '.' + String(remainder)
  return (neg ? '-' : '') + s
}

function groupThousands(digits: string, sep: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

/**
 * Normalise an Iranian mobile number to `9XXXXXXXXX`.
 *
 * The de-facto identity key for a member. Returns null when the input cannot be
 * a valid Iranian mobile — callers must decide whether that is a rejection or a
 * flagged import row.
 */
export function normalizeMobile(input: string): string | null {
  let s = normalizeDigits(input).replace(/[\s\-()‌]/g, '')
  if (s.startsWith('+98')) s = s.slice(3)
  else if (s.startsWith('0098')) s = s.slice(4)
  else if (s.startsWith('98') && s.length === 12) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  return /^9\d{9}$/.test(s) ? s : null
}

/** Display form for a normalised mobile: ۰۹۱۲۳۴۵۶۷۸۹ */
export function formatMobile(normalized: string): string {
  return toPersianDigits('0' + normalized)
}

/**
 * Normalise Arabic codepoints that arrive from imports, older keyboards and
 * copy-paste. Without this, name search silently fails and staff conclude the
 * software cannot find people.
 */
export function normalizePersianText(input: string): string {
  return input
    .replace(/ي/g, 'ی') // ي → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/‌/g, ' ') // ZWNJ → space, for search only
    .replace(/\s+/g, ' ')
    .trim()
}
