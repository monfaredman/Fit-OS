/**
 * Ambient types for jalaali-js, which ships CommonJS with no declarations.
 * Only the surface we actually use is declared.
 */
declare module 'jalaali-js' {
  export interface JalaaliDate { jy: number; jm: number; jd: number }
  export interface GregorianDate { gy: number; gm: number; gd: number }

  const jalaali: {
    toJalaali(gy: number, gm: number, gd: number): JalaaliDate
    toGregorian(jy: number, jm: number, jd: number): GregorianDate
    jalaaliMonthLength(jy: number, jm: number): number
    isLeapJalaaliYear(jy: number): boolean
    isValidJalaaliDate(jy: number, jm: number, jd: number): boolean
  }
  export default jalaali
}
