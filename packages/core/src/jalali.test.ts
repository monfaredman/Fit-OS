import { describe, it, expect } from 'vitest'
import {
  toJalali, fromJalali, jalaliYm, formatJalali, formatJalaliLatin,
  startOfJalaliMonth, endOfJalaliMonth, jalaliMonthLength, isLeapJalaliYear,
  startOfJalaliWeek, weekdayIndex, weekdayName, monthName, addDays, daysBetween,
} from './jalali.js'

const at = (iso: string) => new Date(iso)

describe('Gregorian ↔ Jalali', () => {
  it('places Nowruz 1405 on 2026-03-21', () => {
    expect(formatJalaliLatin(at('2026-03-21T06:00:00Z'))).toBe('1405/01/01')
  })
  it('converts a mid-year date', () => {
    expect(formatJalaliLatin(at('2026-09-14T06:00:00Z'))).toBe('1405/06/23')
  })
  it('round-trips through fromJalali', () => {
    const d = fromJalali(1405, 7, 5)
    expect(formatJalaliLatin(d)).toBe('1405/07/05')
  })
  it('renders Persian digits for display', () => {
    expect(formatJalali(at('2026-09-27T06:00:00Z'))).toBe('۱۴۰۵/۰۷/۰۵')
  })
})

describe('Tehran timezone — the boundary that breaks reports', () => {
  it('uses Tehran local date, not UTC date', () => {
    // 20:30 UTC is 00:00 the next day in Tehran (+03:30). An instant that is
    // still 27 Sep in UTC already belongs to the next Jalali day for the gym.
    expect(formatJalaliLatin(at('2026-09-27T20:29:00Z'))).toBe('1405/07/05')
    expect(formatJalaliLatin(at('2026-09-27T20:30:00Z'))).toBe('1405/07/06')
  })
  it('buckets a late-night check-in into the correct Jalali month', () => {
    // Last moments of Shahrivar in UTC, already Mehr in Tehran.
    expect(jalaliYm(at('2026-09-22T20:29:00Z'))).toBe('1405-06')
    expect(jalaliYm(at('2026-09-22T20:30:00Z'))).toBe('1405-07')
  })
})

describe('jalaliYm bucketing key', () => {
  it('zero-pads the month', () => {
    expect(jalaliYm(at('2026-03-21T06:00:00Z'))).toBe('1405-01')
  })
  it('sorts lexicographically in calendar order', () => {
    const keys = ['1405-10', '1405-02', '1406-01', '1405-12']
    expect([...keys].sort()).toEqual(['1405-02', '1405-10', '1405-12', '1406-01'])
  })
})

describe('month lengths', () => {
  it('gives 31 days to the first six months', () => {
    for (let m = 1; m <= 6; m++) expect(jalaliMonthLength(1405, m)).toBe(31)
  })
  it('gives 30 days to months seven through eleven', () => {
    for (let m = 7; m <= 11; m++) expect(jalaliMonthLength(1405, m)).toBe(30)
  })
  it('gives Esfand 29 days in a common year and 30 in a leap year', () => {
    expect(isLeapJalaliYear(1404)).toBe(false)
    expect(jalaliMonthLength(1404, 12)).toBe(29)
    expect(isLeapJalaliYear(1403)).toBe(true)
    expect(jalaliMonthLength(1403, 12)).toBe(30)
    expect(isLeapJalaliYear(1408)).toBe(true)
    expect(jalaliMonthLength(1408, 12)).toBe(30)
  })
})

describe('month boundaries', () => {
  it('finds the start of the current Jalali month', () => {
    expect(formatJalaliLatin(startOfJalaliMonth(at('2026-09-27T06:00:00Z')))).toBe('1405/07/01')
  })
  it('returns an exclusive end that is the first of the next month', () => {
    expect(formatJalaliLatin(endOfJalaliMonth(at('2026-09-27T06:00:00Z')))).toBe('1405/08/01')
  })
  it('rolls the year over at Esfand', () => {
    const esfand = fromJalali(1405, 12, 10)
    expect(formatJalaliLatin(endOfJalaliMonth(esfand))).toBe('1406/01/01')
  })
})

describe('the week starts on Saturday', () => {
  it('indexes Saturday as 0 and Friday as 6', () => {
    expect(weekdayIndex(at('2026-03-21T06:00:00Z'))).toBe(0) // Sat
    expect(weekdayIndex(at('2026-09-27T06:00:00Z'))).toBe(1) // Sun
    expect(weekdayIndex(at('2026-09-14T06:00:00Z'))).toBe(2) // Mon
  })
  it('names weekdays in Persian', () => {
    expect(weekdayName(at('2026-03-21T06:00:00Z'))).toBe('شنبه')
    expect(weekdayName(at('2026-09-27T06:00:00Z'))).toBe('یکشنبه')
  })
  it('always returns a Saturday from startOfJalaliWeek', () => {
    // The regression guard: JS getDay() would give Sunday and shift every
    // weekly chart by one day, wrong for one day in seven.
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(2026, 8, 1 + i, 6))
      expect(weekdayIndex(startOfJalaliWeek(d))).toBe(0)
    }
  })
  it('keeps a Saturday as its own week start', () => {
    const sat = at('2026-03-21T06:00:00Z')
    expect(formatJalaliLatin(startOfJalaliWeek(sat))).toBe('1405/01/01')
  })
  it('walks back to the preceding Saturday mid-week', () => {
    // Monday 1405/06/23 → Saturday 1405/06/21
    expect(formatJalaliLatin(startOfJalaliWeek(at('2026-09-14T06:00:00Z')))).toBe('1405/06/21')
  })
})

describe('date arithmetic for membership expiry', () => {
  it('crosses a 31-day month boundary', () => {
    expect(formatJalaliLatin(addDays(fromJalali(1405, 1, 31), 1))).toBe('1405/02/01')
  })
  it('crosses the 31→30 day transition at Mehr', () => {
    expect(formatJalaliLatin(addDays(fromJalali(1405, 6, 31), 1))).toBe('1405/07/01')
  })
  it('crosses the year boundary at a 29-day Esfand', () => {
    expect(formatJalaliLatin(addDays(fromJalali(1405, 12, 29), 1))).toBe('1406/01/01')
  })
  it('crosses the year boundary at a 30-day leap Esfand', () => {
    expect(formatJalaliLatin(addDays(fromJalali(1403, 12, 30), 1))).toBe('1404/01/01')
  })
  it('adds a 30-day membership across a 31-day month', () => {
    // Shahrivar has 31 days, so 06/15 + 30d lands on 07/14 — NOT 07/15.
    // Naive "same day next month" arithmetic gets this wrong and every
    // affected member is billed or expired a day late.
    expect(formatJalaliLatin(addDays(fromJalali(1405, 6, 15), 30))).toBe('1405/07/14')
  })
  it('adds a 30-day membership across a 30-day month', () => {
    // Mehr has 30 days, so here 30 days really is "same day next month".
    expect(formatJalaliLatin(addDays(fromJalali(1405, 7, 15), 30))).toBe('1405/08/15')
  })
  it('counts whole days between two instants', () => {
    expect(daysBetween(fromJalali(1405, 7, 1), fromJalali(1405, 7, 8))).toBe(7)
    expect(daysBetween(fromJalali(1405, 12, 29), fromJalali(1406, 1, 1))).toBe(1)
  })
  it('ignores the time of day when counting calendar days', () => {
    // A membership expiring "in 7 days" must not depend on what time it was sold
    const morning = at('2026-09-27T05:00:00Z')
    const evening = at('2026-09-27T15:00:00Z')
    expect(daysBetween(morning, addDays(evening, 7))).toBe(7)
  })
})

describe('month names', () => {
  it('names the Jalali month in Persian', () => {
    expect(monthName(at('2026-03-21T06:00:00Z'))).toBe('فروردین')
    expect(monthName(at('2026-09-27T06:00:00Z'))).toBe('مهر')
  })
})
