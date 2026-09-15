/**
 * The error catalogue — design/api-design.md §3.
 *
 * Stable English `code` for machines, Persian `message` shown to the user
 * verbatim. Per product/principles.md, an error says what went wrong and what to
 * do next: no apologies, no "an error occurred", no stack traces.
 */

export const ERRORS = {
  UNAUTHENTICATED: { status: 401, message: 'لطفاً دوباره وارد شوید.' },
  FORBIDDEN: { status: 403, message: 'شما دسترسی این کار را ندارید.' },
  OTP_REQUIRED: { status: 403, message: 'برای این کار کد تأیید لازم است.' },
  NOT_FOUND: { status: 404, message: 'یافت نشد.' },
  VALIDATION_ERROR: { status: 400, message: 'اطلاعات ارسالی معتبر نیست.' },
  DUPLICATE_MOBILE: { status: 409, message: 'این شماره موبایل قبلاً ثبت شده است.' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, message: 'درخواست تکراری قابل تشخیص نیست.' },
  IDEMPOTENCY_KEY_REUSED: { status: 409, message: 'این درخواست قبلاً ثبت شده است.' },
  LEDGER_UNBALANCED: { status: 500, message: 'خطای داخلی در ثبت مالی. تغییری اعمال نشد.' },
  INSUFFICIENT_WALLET_BALANCE: { status: 422, message: 'موجودی کیف پول کافی نیست.' },
  MEMBERSHIP_EXPIRED: { status: 422, message: 'اشتراک منقضی شده است.' },
  NO_SESSIONS_REMAINING: { status: 422, message: 'جلسات این اشتراک تمام شده است.' },
  MEMBERSHIP_FROZEN: { status: 422, message: 'اشتراک در حالت تعلیق است.' },
  DISCOUNT_EXCEEDS_CAP: { status: 422, message: 'تخفیف بیش از حد مجاز شماست.' },
  WRITEOFF_EXCEEDS_CAP: { status: 422, message: 'مبلغ بخشودگی بیش از حد مجاز شماست.' },
  SMS_CREDIT_EXHAUSTED: { status: 422, message: 'اعتبار پیامک تمام شده است.' },
  LOCKER_OCCUPIED: { status: 409, message: 'این کمد در اختیار فرد دیگری است.' },
  IMPORT_UNIT_AMBIGUOUS: { status: 422, message: 'واحد مبالغ فایل مشخص نیست (ریال یا تومان).' },
  RATE_LIMITED: { status: 429, message: 'تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید.' },
  NO_TENANT: { status: 400, message: 'باشگاه مشخص نشده است.' },
} as const;

export type ErrorCode = keyof typeof ERRORS;

export interface ErrorEnvelope {
  error: { code: ErrorCode | string; message: string; details?: unknown };
}

/** Thrown by services; translated to the envelope by the global filter. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(ERRORS[code].message);
    this.name = 'AppError';
    this.status = ERRORS[code].status;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: ERRORS[this.code].message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
