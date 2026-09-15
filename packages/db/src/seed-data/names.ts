/**
 * Persian name corpus for the seed.
 *
 * Deliberately mixes Arabic `ي`/`ك` with Persian `ی`/`ک` in a slice of the
 * names — exactly as real imported data does. That is what makes the seed
 * useful: it surfaces the search-normalisation bug on day one instead of at a
 * gym. See @gymos/core `normalizePersianText`.
 */

export const MALE_FIRST = [
  'علی', 'محمد', 'رضا', 'حسین', 'امیر', 'مهدی', 'سعید', 'مجید', 'حمید', 'وحید',
  'بهنام', 'فرهاد', 'کامران', 'بابک', 'آرش', 'سینا', 'پویا', 'نیما', 'کاوه', 'سیاوش',
  'میلاد', 'پیمان', 'شهاب', 'فرزاد', 'مسعود', 'ناصر', 'ابراهیم', 'یاسر', 'اشکان', 'بهزاد',
] as const;

export const FEMALE_FIRST = [
  'مریم', 'فاطمه', 'زهرا', 'سارا', 'نگار', 'الهام', 'شیرین', 'لیلا', 'نازنین', 'پریسا',
  'مینا', 'رویا', 'سمیرا', 'الناز', 'شقایق', 'هانیه', 'نرگس', 'آزاده', 'مهسا', 'ترانه',
  'بهاره', 'یلدا', 'سحر', 'نیلوفر', 'مرجان', 'کیمیا', 'آناهیتا', 'پگاه', 'غزاله', 'سپیده',
] as const;

export const LAST = [
  'احمدی', 'محمدی', 'رضایی', 'حسینی', 'کریمی', 'موسوی', 'جعفری', 'قاسمی', 'رحیمی', 'صادقی',
  'نوری', 'اکبری', 'زارع', 'شریفی', 'عباسی', 'یوسفی', 'کاظمی', 'سلطانی', 'فرهادی', 'مرادی',
  'بهرامی', 'نجفی', 'طاهری', 'اسدی', 'داوودی', 'قربانی', 'مقدم', 'خسروی', 'ملکی', 'امینی',
  'صالحی', 'حیدری', 'عزیزی', 'رستمی', 'شاکری', 'توکلی', 'ابراهیمی', 'نیکنام', 'سعیدی', 'پورمند',
] as const;

/**
 * Rewrite a name with Arabic codepoints, the way older keyboards and legacy
 * desktop exports produce. `ی` → `ي`, `ک` → `ك`.
 */
export function toArabicSpelling(name: string): string {
  return name.replace(/ی/g, 'ي').replace(/ک/g, 'ك');
}

export const DISCIPLINES = ['بدنسازی', 'فیتنس', 'TRX', 'کراس‌فیت', 'ایروبیک', 'یوگا'] as const;

export const PRODUCTS = [
  { name: 'آب معدنی', priceRial: 150_000 },
  { name: 'نوشیدنی انرژی‌زا', priceRial: 850_000 },
  { name: 'پروتئین وی (سروینگ)', priceRial: 1_200_000 },
  { name: 'شکلات پروتئینی', priceRial: 650_000 },
  { name: 'آبمیوه طبیعی', priceRial: 450_000 },
  { name: 'حوله یکبار مصرف', priceRial: 200_000 },
] as const;
