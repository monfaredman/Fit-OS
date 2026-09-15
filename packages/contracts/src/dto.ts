/**
 * Request and response schemas shared by the API and every client.
 *
 * Convention (mirrors Vieral/Trend `packages/types`): every schema is
 * `xxxSchema` with a co-located inferred type. Query schemas use `z.coerce`
 * because query-string values always arrive as strings.
 *
 * Controllers call `schema.parse(body)` inline — there is no ZodValidationPipe.
 */

import { z } from 'zod';
import {
  accessReasonSchema,
  checkInMethodSchema,
  lifecycleStageSchema,
  membershipStatusSchema,
  paymentMethodSchema,
  planKindSchema,
  riskBandSchema,
  staffRoleSchema,
} from './enums.js';

/* ------------------------------- primitives ------------------------------- */

/**
 * Accepts Persian and Latin digits, strips separators, and normalises to
 * `9XXXXXXXXX`. Staff switch keyboard layouts mid-shift; both must work.
 */
export const mobileSchema = z
  .string()
  .transform((raw) => {
    let s = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
    s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    s = s.replace(/[\s\-()‌]/g, '');
    if (s.startsWith('+98')) s = s.slice(3);
    else if (s.startsWith('0098')) s = s.slice(4);
    else if (s.startsWith('98') && s.length === 12) s = s.slice(2);
    if (s.startsWith('0')) s = s.slice(1);
    return s;
  })
  .refine((s) => /^9\d{9}$/.test(s), { message: 'شماره موبایل معتبر نیست' });

/** Integer Rial. Never Toman on the wire (invariant 1). */
export const rialSchema = z.number().int().nonnegative();
export const positiveRialSchema = z.number().int().positive();

/** `1405-07` — the report bucketing key. */
export const jalaliYmSchema = z.string().regex(/^\d{4}-\d{2}$/, 'قالب تاریخ باید 1405-07 باشد');

export const uuidSchema = z.string().uuid();

export const cursorPageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type CursorPage = z.infer<typeof cursorPageSchema>;

/* ---------------------------------- auth ---------------------------------- */

export const staffLoginBodySchema = z.object({
  mobile: mobileSchema,
  password: z.string().min(6, 'رمز عبور حداقل ۶ کاراکتر است'),
});
export type StaffLoginBody = z.infer<typeof staffLoginBodySchema>;

export const staffSessionDtoSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  staff: z.object({
    id: uuidSchema,
    firstName: z.string(),
    lastName: z.string(),
    role: staffRoleSchema,
    orgId: uuidSchema,
  }),
});
export type StaffSessionDto = z.infer<typeof staffSessionDtoSchema>;

/* --------------------------------- people --------------------------------- */

export const searchQuerySchema = z.object({
  q: z.string().min(2, 'حداقل دو حرف وارد کنید').max(64),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const createPersonBodySchema = z.object({
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
  mobile: mobileSchema,
  gender: z.enum(['male', 'female']).optional(),
  birthDate: z.string().optional(),
  nationalId: z.string().max(10).optional(),
  source: z.string().max(32).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreatePersonBody = z.infer<typeof createPersonBodySchema>;

export const updatePersonBodySchema = createPersonBodySchema.partial();
export type UpdatePersonBody = z.infer<typeof updatePersonBodySchema>;

export const peopleQuerySchema = cursorPageSchema.extend({
  stage: lifecycleStageSchema.optional(),
  band: riskBandSchema.optional(),
});
export type PeopleQuery = z.infer<typeof peopleQuerySchema>;

/** The member card — design/api-design.md §5. Four facts, fixed positions. */
export const memberCardDtoSchema = z.object({
  person: z.object({
    id: uuidSchema,
    firstName: z.string(),
    lastName: z.string(),
    mobile: z.string(),
    memberNo: z.number().int().nullable(),
    photoUrl: z.string().nullable(),
    stage: lifecycleStageSchema,
  }),
  membership: z
    .object({
      id: uuidSchema,
      planName: z.string(),
      status: membershipStatusSchema,
      endsAt: z.string().nullable(),
      daysRemaining: z.number().int().nullable(),
      sessionsRemaining: z.number().int().nullable(),
      sessionsTotal: z.number().int().nullable(),
    })
    .nullable(),
  arrearsRial: rialSchema,
  arrearsAgeDays: z.number().int().nullable(),
  walletRial: rialSchema,
  locker: z.object({ code: z.string(), kind: z.string() }).nullable(),
  access: z.object({ canEnter: z.boolean(), reasonCode: accessReasonSchema }),
});
export type MemberCardDto = z.infer<typeof memberCardDtoSchema>;

export const searchResultDtoSchema = z.object({
  id: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  mobile: z.string(),
  memberNo: z.number().int().nullable(),
  stage: lifecycleStageSchema,
  canEnter: z.boolean().nullable(),
  arrearsRial: rialSchema,
});
export type SearchResultDto = z.infer<typeof searchResultDtoSchema>;

/* ------------------------------ memberships ------------------------------- */

export const createMembershipBodySchema = z.object({
  personId: uuidSchema,
  planId: uuidSchema,
  startsAt: z.string().optional(),
  discountRial: rialSchema.default(0),
  trainerId: uuidSchema.optional(),
});
export type CreateMembershipBody = z.infer<typeof createMembershipBodySchema>;

export const freezeMembershipBodySchema = z.object({
  fromAt: z.string().optional(),
  reason: z.string().max(200).optional(),
});
export type FreezeMembershipBody = z.infer<typeof freezeMembershipBodySchema>;

export const unfreezeMembershipBodySchema = z.object({ toAt: z.string().optional() });
export type UnfreezeMembershipBody = z.infer<typeof unfreezeMembershipBodySchema>;

export const planDtoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: planKindSchema,
  durationDays: z.number().int().nullable(),
  sessionCount: z.number().int().nullable(),
  priceRial: rialSchema,
  discipline: z.string().nullable(),
});
export type PlanDto = z.infer<typeof planDtoSchema>;

/* ---------------------------------- money --------------------------------- */

export const createPaymentBodySchema = z.object({
  personId: uuidSchema,
  method: paymentMethodSchema,
  amountRial: positiveRialSchema,
  reference: z.string().max(64).optional(),
  receivedAt: z.string().optional(),
});
export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;

export const walletTopUpBodySchema = z.object({
  personId: uuidSchema,
  method: paymentMethodSchema,
  amountRial: positiveRialSchema,
});
export type WalletTopUpBody = z.infer<typeof walletTopUpBodySchema>;

export const arrearsQuerySchema = cursorPageSchema.extend({
  agedOverDays: z.coerce.number().int().min(0).default(0),
  minRial: z.coerce.number().int().min(0).default(0),
});
export type ArrearsQuery = z.infer<typeof arrearsQuerySchema>;

export const arrearsRowDtoSchema = z.object({
  personId: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  mobile: z.string(),
  arrearsRial: rialSchema,
  ageDays: z.number().int().nullable(),
});
export type ArrearsRowDto = z.infer<typeof arrearsRowDtoSchema>;

export const arrearsSummaryDtoSchema = z.object({
  totalRial: rialSchema,
  memberCount: z.number().int(),
  rows: z.array(arrearsRowDtoSchema),
  nextCursor: z.string().nullable(),
});
export type ArrearsSummaryDto = z.infer<typeof arrearsSummaryDtoSchema>;

export const drawerCloseBodySchema = z.object({
  /** What the receptionist counted. The only figure staff supply. */
  countedRial: rialSchema,
  note: z.string().max(500).optional(),
});
export type DrawerCloseBody = z.infer<typeof drawerCloseBodySchema>;

/* --------------------------------- check-in -------------------------------- */

export const createCheckInBodySchema = z.object({
  personId: uuidSchema,
  locationId: uuidSchema.optional(),
  method: checkInMethodSchema.default('qr'),
  /** Client-generated, stable across retries. Makes offline replay a no-op. */
  clientEventId: z.string().min(8).max(128),
  occurredAt: z.string().optional(),
  /** Staff override of a denial. Recorded with the staff id. */
  override: z.boolean().default(false),
});
export type CreateCheckInBody = z.infer<typeof createCheckInBodySchema>;

export const checkInResultDtoSchema = z.object({
  id: uuidSchema,
  admitted: z.boolean(),
  reasonCode: accessReasonSchema,
  personId: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  sessionsRemaining: z.number().int().nullable(),
  arrearsRial: rialSchema,
  duplicate: z.boolean(),
});
export type CheckInResultDto = z.infer<typeof checkInResultDtoSchema>;

export const checkInsQuerySchema = z.object({
  date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CheckInsQuery = z.infer<typeof checkInsQuerySchema>;

/* --------------------------------- health ---------------------------------- */

export const healthDtoSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.boolean(),
  version: z.string(),
  uptimeSec: z.number(),
});
export type HealthDto = z.infer<typeof healthDtoSchema>;
