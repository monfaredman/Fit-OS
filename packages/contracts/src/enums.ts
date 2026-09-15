/**
 * Enum-ish values. Columns are `text` in Postgres (D-007) and validated here —
 * adding a value is a code change, not a migration ordeal.
 */
import { z } from 'zod';

export const staffRoleSchema = z.enum([
  'owner',
  'manager',
  'receptionist',
  'trainer',
  'accountant',
]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const lifecycleStageSchema = z.enum([
  'lead', 'trial', 'active', 'frozen', 'arrears', 'lapsed', 'won_back', 'blocked',
]);
export type LifecycleStage = z.infer<typeof lifecycleStageSchema>;

export const planKindSchema = z.enum(['duration', 'session_count', 'hybrid', 'open']);
export type PlanKind = z.infer<typeof planKindSchema>;

export const membershipStatusSchema = z.enum([
  'pending', 'active', 'frozen', 'expired', 'cancelled',
]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const paymentMethodSchema = z.enum([
  'cash', 'card_pos', 'card_transfer', 'gateway', 'direct_debit', 'wallet',
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const checkInMethodSchema = z.enum(['qr', 'card', 'fingerprint', 'face', 'manual', 'kiosk']);
export type CheckInMethod = z.infer<typeof checkInMethodSchema>;

export const accessReasonSchema = z.enum([
  'ok', 'expired', 'arrears', 'no_sessions', 'frozen', 'wrong_gender_block', 'no_membership',
]);
export type AccessReason = z.infer<typeof accessReasonSchema>;

export const riskBandSchema = z.enum(['low', 'medium', 'high']);
export type RiskBand = z.infer<typeof riskBandSchema>;
