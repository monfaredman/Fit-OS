/**
 * Membership arithmetic and the door decision — pure, so both are testable
 * without a database and reusable by the check-in path (TASK-009).
 *
 * All date maths goes through `@gymos/core` `addDays`, which counts *calendar*
 * days in Tehran. "30 days" must not mean 30 × 86400 seconds, and it must not
 * mean "same day next month": Shahrivar has 31 days, Mehr has 30, and Esfand
 * has 29 or 30. Getting this wrong bills or expires members a day late.
 */

import { addDays, daysBetween } from '@gymos/core';

export type PlanKind = 'duration' | 'session_count' | 'hybrid' | 'open';

export interface PlanLike {
  kind: PlanKind;
  durationDays: number | null;
  sessionCount: number | null;
  genderRestriction?: string | null;
}

export interface MembershipLike {
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  sessionsTotal: number | null;
  sessionsUsed: number;
}

export type AccessReason =
  | 'ok'
  | 'expired'
  | 'arrears'
  | 'no_sessions'
  | 'frozen'
  | 'wrong_gender_block'
  | 'no_membership';

/** Arrears handling at the door, configured per organization. */
export type ArrearsPolicy = 'block' | 'warn' | 'grace';

/**
 * When a membership ends. `open` plans never expire; `session_count` still
 * carries a window unless the plan says otherwise.
 */
export function computeEndsAt(plan: PlanLike, startsAt: Date): Date | null {
  if (plan.kind === 'open') return null;
  if (plan.durationDays === null) return null;
  return addDays(startsAt, plan.durationDays);
}

export function sessionsRemaining(m: MembershipLike): number | null {
  if (m.sessionsTotal === null) return null;
  return Math.max(0, m.sessionsTotal - m.sessionsUsed);
}

/**
 * Whole calendar days a freeze is worth. A freeze that starts and ends the same
 * day credits zero, not one — the member lost no access.
 */
export function freezeDaysCredited(fromAt: Date, toAt: Date): number {
  return Math.max(0, daysBetween(fromAt, toAt));
}

/** Unfreezing pushes the end date out by exactly the days lost. */
export function extendForFreeze(endsAt: Date | null, daysCredited: number): Date | null {
  if (endsAt === null) return null;
  return addDays(endsAt, daysCredited);
}

export interface AccessInput {
  membership: MembershipLike | null;
  arrearsRial: number;
  policy: ArrearsPolicy;
  graceRial: number;
  now?: Date;
}

export interface AccessDecision {
  canEnter: boolean;
  reasonCode: AccessReason;
  sessionsRemaining: number | null;
}

/**
 * The door decision, precomputed so a kiosk can admit with no network
 * (design/offline-sync.md §1).
 *
 * Order matters and is deliberate: structural reasons (no membership, frozen,
 * expired, sessions exhausted) come before money. A member whose subscription
 * ran out is not "in arrears" — telling the receptionist the wrong reason sends
 * them down the wrong path at the desk.
 *
 * Arrears default to `warn`, not `block`: hard-blocking a paying customer over
 * a small balance generates angry phone calls, which is why the threshold and
 * the policy are both per-organization.
 */
export function decideAccess(input: AccessInput): AccessDecision {
  const { membership, arrearsRial, policy, graceRial } = input;
  const now = input.now ?? new Date();

  if (!membership) return { canEnter: false, reasonCode: 'no_membership', sessionsRemaining: null };

  const remaining = sessionsRemaining(membership);

  if (membership.status === 'frozen') {
    return { canEnter: false, reasonCode: 'frozen', sessionsRemaining: remaining };
  }
  if (membership.status === 'cancelled') {
    return { canEnter: false, reasonCode: 'no_membership', sessionsRemaining: remaining };
  }
  if (membership.endsAt !== null && membership.endsAt.getTime() < now.getTime()) {
    return { canEnter: false, reasonCode: 'expired', sessionsRemaining: remaining };
  }
  if (remaining !== null && remaining <= 0) {
    return { canEnter: false, reasonCode: 'no_sessions', sessionsRemaining: 0 };
  }

  if (arrearsRial > 0) {
    const overGrace = arrearsRial > graceRial;
    if (policy === 'block' && overGrace) {
      return { canEnter: false, reasonCode: 'arrears', sessionsRemaining: remaining };
    }
    if (policy === 'grace' && overGrace) {
      return { canEnter: false, reasonCode: 'arrears', sessionsRemaining: remaining };
    }
    // `warn`: admit, but the desk still shows the debt on the member card.
  }

  return { canEnter: true, reasonCode: 'ok', sessionsRemaining: remaining };
}

/** A check-in consumes a session only on plans that count them. */
export function consumesSession(plan: PlanLike): boolean {
  return plan.kind === 'session_count' || plan.kind === 'hybrid';
}

/**
 * Renewal starts the day after the current membership ends, or today if it
 * already lapsed — never mid-period, which would silently shorten what the
 * member paid for.
 */
export function renewalStart(currentEndsAt: Date | null, now: Date = new Date()): Date {
  if (currentEndsAt === null) return now;
  return currentEndsAt.getTime() > now.getTime() ? addDays(currentEndsAt, 1) : now;
}
