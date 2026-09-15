import { describe, it, expect } from 'vitest'
import {
  normalizeDigits, toPersianDigits, parseTomanInput, tomanToRial,
  formatToman, formatTomanLatin, normalizeMobile, formatMobile,
  normalizePersianText,
} from './money.js'

describe('digit normalisation', () => {
  it('converts Persian digits to Latin', () => {
    expect(normalizeDigits('۱۵۰۰۰۰۰')).toBe('1500000')
  })
  it('converts Arabic-Indic digits to Latin', () => {
    expect(normalizeDigits('١٥٠٠')).toBe('1500')
  })
  it('leaves Latin digits and other characters alone', () => {
    expect(normalizeDigits('1500 تومان')).toBe('1500 تومان')
  })
  it('handles mixed scripts in one string', () => {
    expect(normalizeDigits('۱2۳')).toBe('123')
  })
  it('round-trips through toPersianDigits', () => {
    expect(normalizeDigits(toPersianDigits('9876543210'))).toBe('9876543210')
  })
})

describe('parsing Toman input into Rial', () => {
  it('accepts Latin digits', () => {
    expect(parseTomanInput('1500000')).toBe(15_000_000)
  })
  it('accepts Persian digits — the same field, the same shift', () => {
    expect(parseTomanInput('۱۵۰۰۰۰۰')).toBe(15_000_000)
  })
  it('accepts Persian thousands separators', () => {
    expect(parseTomanInput('۱٬۵۰۰٬۰۰۰')).toBe(15_000_000)
  })
  it('accepts Latin commas', () => {
    expect(parseTomanInput('1,500,000')).toBe(15_000_000)
  })
  it('accepts a trailing currency word', () => {
    expect(parseTomanInput('۲٬۵۰۰٬۰۰۰ تومان')).toBe(25_000_000)
  })
  it('tolerates ZWNJ and stray whitespace from copy-paste', () => {
    expect(parseTomanInput(' ۲۵۰‌۰۰۰ ')).toBe(2_500_000)
  })
  it('scales by 10 exactly, with no float error', () => {
    // 0.1 + 0.2 territory: naive parseFloat(x)*10 drifts, string shifting does not
    expect(parseTomanInput('1500.5')).toBe(15_005)
    expect(parseTomanInput('0.1')).toBe(1)
    expect(parseTomanInput('0.3')).toBe(3)
  })
  it('rejects amounts finer than one Rial rather than rounding', () => {
    expect(() => parseTomanInput('1500.55')).toThrow(/finer than 1 Rial/)
  })
  it('rejects garbage instead of guessing', () => {
    expect(() => parseTomanInput('abc')).toThrow()
    expect(() => parseTomanInput('')).toThrow()
    expect(() => parseTomanInput('12-34')).toThrow()
  })
})

describe('formatting Rial as Toman', () => {
  it('divides by ten and groups with Persian separators', () => {
    expect(formatToman(25_000_000)).toBe('۲٬۵۰۰٬۰۰۰ تومان')
  })
  it('omits the suffix when asked', () => {
    expect(formatToman(4_200_000, { suffix: false })).toBe('۴۲۰٬۰۰۰')
  })
  it('never rounds away a Rial remainder', () => {
    // 15005 Rial is 1500.5 Toman — showing "1500" would silently lose money
    expect(formatTomanLatin(15_005)).toBe('1,500.5')
  })
  it('uses a real minus sign for negative balances', () => {
    expect(formatToman(-10_000, { suffix: false })).toBe('−۱٬۰۰۰')
  })
  it('handles zero', () => {
    expect(formatTomanLatin(0)).toBe('0')
  })
  it('round-trips parse → format for a typical tuition', () => {
    const rial = parseTomanInput('۲٬۵۰۰٬۰۰۰')
    expect(formatToman(rial)).toBe('۲٬۵۰۰٬۰۰۰ تومان')
  })
  it('agrees with tomanToRial', () => {
    expect(tomanToRial(2_500_000)).toBe(parseTomanInput('2500000'))
  })
})

describe('mobile normalisation — the member identity key', () => {
  it.each([
    ['09123456789', '9123456789'],
    ['۰۹۱۲۳۴۵۶۷۸۹', '9123456789'],
    ['+989123456789', '9123456789'],
    ['00989123456789', '9123456789'],
    ['989123456789', '9123456789'],
    ['9123456789', '9123456789'],
    ['0912 345 6789', '9123456789'],
    ['0912-345-6789', '9123456789'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected)
  })

  it('returns null for things that cannot be Iranian mobiles', () => {
    expect(normalizeMobile('02122365531')).toBeNull() // landline
    expect(normalizeMobile('123')).toBeNull()
    expect(normalizeMobile('')).toBeNull()
  })

  it('formats back to the display form', () => {
    expect(formatMobile('9123456789')).toBe('۰۹۱۲۳۴۵۶۷۸۹')
  })
})

describe('Persian text normalisation', () => {
  it('converts Arabic yeh and kaf to Persian', () => {
    // These arrive from imports and older keyboards; without normalising,
    // name search silently fails and staff conclude the software is broken.
    expect(normalizePersianText('يك')).toBe('یک')
  })
  it('makes an Arabic-typed name match a Persian-typed one', () => {
    const arabic = normalizePersianText('علي رضايي')
    const persian = normalizePersianText('علی رضایی')
    expect(arabic).toBe(persian)
  })
  it('collapses ZWNJ and whitespace', () => {
    expect(normalizePersianText('  محمد‌رضا   احمدی ')).toBe('محمد رضا احمدی')
  })
})
