/**
 * The permission matrix from design/permissions.md, as data.
 *
 * Design principle: **the receptionist is the primary user.** They get broad
 * *operational* power and near-zero *financial* power — that split is what
 * closes the three cash-fraud attacks in §2 of that document:
 *
 *   - receptionists cannot write off arrears at all
 *   - discounts are capped per role, over-cap needs a manager
 *   - the drawer variance is visible to the owner
 *
 * Pure and framework-free so it can be unit-tested directly, Trend-style.
 */

import type { StaffRole } from '@gymos/contracts';

export type Capability =
  // door & attendance
  | 'checkin.create'
  | 'checkin.override'
  | 'checkin.edit'
  // people
  | 'person.create'
  | 'person.edit'
  | 'person.delete'
  | 'person.export'
  // memberships
  | 'membership.sell'
  | 'membership.discount'
  | 'membership.freeze'
  | 'membership.cancel'
  | 'plan.manage'
  // money
  | 'payment.take'
  | 'wallet.topup'
  | 'arrears.writeoff'
  | 'ledger.adjust'
  | 'drawer.close'
  | 'drawer.variance.all'
  | 'revenue.view.org'
  // facilities & retail
  | 'locker.assign'
  | 'locker.price'
  | 'stock.count'
  | 'stock.adjust'
  // automation & messaging
  | 'automation.manage'
  | 'sms.single'
  | 'sms.bulk'
  | 'sms.buy'
  // retention
  | 'risk.view'
  // staff & org
  | 'staff.manage'
  | 'commission.manage'
  | 'settlement.run'
  | 'org.manage'
  | 'import.run'
  | 'export.full'
  | 'audit.view'
  | 'billing.manage';

const O = 'owner';
const M = 'manager';
const R = 'receptionist';
const T = 'trainer';
const A = 'accountant';

/** Who may do what. Absent from the list = denied. */
const MATRIX: Record<Capability, readonly StaffRole[]> = {
  'checkin.create': [O, M, R, T],
  'checkin.override': [O, M, R],
  'checkin.edit': [O, M],

  'person.create': [O, M, R, T],
  'person.edit': [O, M, R],
  'person.delete': [O, M],
  'person.export': [O],

  'membership.sell': [O, M, R],
  'membership.discount': [O, M, R], // receptionist is capped — see discountCapPct
  'membership.freeze': [O, M, R],
  'membership.cancel': [O, M],
  'plan.manage': [O, M],

  'payment.take': [O, M, R, A],
  'wallet.topup': [O, M, R, A],
  // The fraud control: a receptionist who could void a debt could pocket the cash.
  'arrears.writeoff': [O, M],
  'ledger.adjust': [O, A],
  'drawer.close': [O, M, R, A],
  'drawer.variance.all': [O, M, A],
  'revenue.view.org': [O, M, A],

  'locker.assign': [O, M, R],
  'locker.price': [O, M],
  'stock.count': [O, M, R],
  'stock.adjust': [O, M],

  'automation.manage': [O, M],
  'sms.single': [O, M, R],
  'sms.bulk': [O, M],
  'sms.buy': [O, A],

  'risk.view': [O, M, R, T],

  'staff.manage': [O, M],
  'commission.manage': [O, M],
  'settlement.run': [O, M, A],
  'org.manage': [O, M],
  'import.run': [O, M],
  'export.full': [O],
  'audit.view': [O, M, A],
  'billing.manage': [O],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return MATRIX[capability].includes(role);
}

/** Every capability a role holds. Handy for shipping the UI's affordances. */
export function capabilitiesFor(role: StaffRole): Capability[] {
  return (Object.keys(MATRIX) as Capability[]).filter((c) => can(role, c));
}

/**
 * Discount ceiling by role, as a percentage of list price.
 *
 * `orgMaxPct` is the org's configured cap for a receptionist. Owner and manager
 * are unrestricted; anything above a receptionist's cap needs escalation, which
 * is what makes an outlier discount rate per staff member a fraud signal rather
 * than noise.
 */
export function discountCapPct(role: StaffRole, orgMaxPct: number): number {
  if (role === 'owner' || role === 'manager') return 100;
  if (role === 'receptionist') return orgMaxPct;
  return 0;
}

/**
 * Write-off ceiling in integer Rial. Receptionists get zero — they cannot write
 * off at all, which is the point.
 */
export function writeoffCapRial(role: StaffRole, orgMaxRial: number): number {
  if (role === 'owner') return Number.MAX_SAFE_INTEGER;
  if (role === 'manager') return orgMaxRial;
  return 0;
}
