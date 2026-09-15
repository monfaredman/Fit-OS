/**
 * Jalali (Solar Hijri) calendar.
 *
 * Timestamps are stored as UTC. Jalali is a *presentation and bucketing*
 * concern — but bucketing is where the bugs are:
 *
 *   - Jalali months have variable lengths (31/31/31/31/31/31/30/30/30/30/30/29|30)
 *   - The year begins at Nowruz, not in January
 *   - **The week begins on Saturday**, which silently breaks every "this week"
 *     query if you take the JS default of Sunday
 *   - A check-in at 01:00 Tehran is a different Jalali day than the same instant
 *     in UTC, so every conversion must go through Tehran local time first
 *
 * Iran abolished DST in 2022, so Asia/Tehran is a fixed +03:30 — but we still
 * resolve through Intl rather than hardcoding the offset.
 */

// jalaali-js ships CommonJS. A default import works under both Vite's interop
// and plain node ESM; named imports only work under the former.
import jalaali from 'jalaali-js'
const { toJalaali, toGregorian, jalaaliMonthLength, isLeapJalaaliYear } = jalaali

export const TEHRAN = 'Asia/Tehran'

export interface JalaliDate {
  jy: number
  jm: number
  jd: number
}

const partsFmt = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Gregorian Y/M/D and H:M as observed in Tehran for a given instant. */
export function tehranParts(date: Date): {
  gy: number
  gm: number
  gd: number
  hour: number
  minute: number
} {
  const p = Object.fromEntries(
    partsFmt.formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  return {
    gy: Number(p.year),
    gm: Number(p.month),
    gd: Number(p.day),
    // Intl renders midnight as "24" in some ICU versions under hour12:false
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
  }
}

/** The Jalali calendar date on which this instant falls, in Tehran. */
export function toJalali(date: Date): JalaliDate {
  const { gy, gm, gd } = tehranParts(date)
  return toJalaali(gy, gm, gd)
}

/** Midnight Tehran at the start of the given Jalali date, as a UTC instant. */
export function fromJalali(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = toGregorian(jy, jm, jd)
  // Tehran is UTC+03:30 year-round since 2022.
  return new Date(Date.UTC(gy, gm - 1, gd, 0, 0) - 3.5 * 3600 * 1000)
}

/**
 * The `jalaliYm` bucketing key denormalised onto transactional tables:
 * `"1405-07"`. Every revenue and attendance report groups by this.
 */
export function jalaliYm(date: Date): string {
  const { jy, jm } = toJalali(date)
  return `${jy}-${String(jm).padStart(2, '0')}`
}

/** `۱۴۰۵/۰۷/۰۵` — the only date form shown to staff or members. */
export function formatJalali(date: Date): string {
  const { jy, jm, jd } = toJalali(date)
  const s = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
  return s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
}

/** Latin form, for logs, filenames and test assertions. */
export function formatJalaliLatin(date: Date): string {
  const { jy, jm, jd } = toJalali(date)
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
}

export function startOfJalaliMonth(date: Date): Date {
  const { jy, jm } = toJalali(date)
  return fromJalali(jy, jm, 1)
}

/** Exclusive end — midnight Tehran at the start of the next Jalali month. */
export function endOfJalaliMonth(date: Date): Date {
  const { jy, jm } = toJalali(date)
  return jm === 12 ? fromJalali(jy + 1, 1, 1) : fromJalali(jy, jm + 1, 1)
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm)
}

export function isLeapJalaliYear(jy: number): boolean {
  return isLeapJalaaliYear(jy)
}

/**
 * Start of the Iranian week — **Saturday** (شنبه), midnight Tehran.
 *
 * JS `getDay()` gives 0=Sunday. In Tehran the week runs Sat..Fri, so Saturday
 * must map to index 0. Getting this wrong shifts every weekly chart by one day
 * and makes "this week" quietly wrong for one day in seven.
 */
export function startOfJalaliWeek(date: Date): Date {
  const { jy, jm, jd } = toJalali(date)
  const midnight = fromJalali(jy, jm, jd)
  const dow = weekdayIndex(midnight) // 0 = Saturday
  return new Date(midnight.getTime() - dow * 86400_000)
}

/** 0 = شنبه (Saturday) … 6 = جمعه (Friday). */
export function weekdayIndex(date: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN,
    weekday: 'short',
  }).format(date)
  const order = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  return order.indexOf(name)
}

export const WEEKDAY_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const
export const MONTH_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
] as const

export function weekdayName(date: Date): string {
  return WEEKDAY_FA[weekdayIndex(date)]!
}

export function monthName(date: Date): string {
  return MONTH_FA[toJalali(date).jm - 1]!
}

/**
 * Add whole days to an instant, preserving Tehran wall-clock midnight.
 * Used for membership expiry and freeze credits, where "30 days" must mean 30
 * calendar days in Tehran, not 30 × 86400 seconds.
 */
export function addDays(date: Date, days: number): Date {
  const { jy, jm, jd } = toJalali(date)
  const { gy, gm, gd } = toGregorian(jy, jm, jd)
  const shifted = new Date(Date.UTC(gy, gm - 1, gd + days))
  const j = toJalaali(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  )
  return fromJalali(j.jy, j.jm, j.jd)
}

/** Whole Tehran-calendar days between two instants. */
export function daysBetween(from: Date, to: Date): number {
  const a = toJalali(from)
  const b = toJalali(to)
  const ga = toGregorian(a.jy, a.jm, a.jd)
  const gb = toGregorian(b.jy, b.jm, b.jd)
  const ms =
    Date.UTC(gb.gy, gb.gm - 1, gb.gd) - Date.UTC(ga.gy, ga.gm - 1, ga.gd)
  return Math.round(ms / 86400_000)
}
