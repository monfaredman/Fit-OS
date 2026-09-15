/**
 * Double-entry ledger.
 *
 * There are no stored balances anywhere in GymOS. A member's arrears IS the
 * balance of their `member_receivable` account; their wallet IS the balance of
 * their `member_wallet` account. One mechanism, four features — and the classic
 * gym-software bug (the debt column disagreeing with the payments) becomes
 * structurally impossible.
 *
 * This module is defence in depth. The database enforces the same invariant via
 * a deferred constraint trigger in design/0001_guards.sql; that is the
 * authority. This exists so a bug fails in a unit test rather than at a gym.
 *
 * SIGN CONVENTION — raw balance = Σ debits − Σ credits.
 *   member_receivable  positive → the member owes the gym      (asset)
 *   cash_drawer / bank positive → the gym holds it             (asset)
 *   member_wallet      negative → the gym owes the member      (liability)
 *   revenue_*          negative → earned                       (revenue)
 * Use displayBalance() at every UI boundary so liabilities and revenue read
 * positive to humans.
 */

import type { Rial } from './money.js'

export type AccountKind =
  | 'member_wallet'
  | 'member_receivable'
  | 'cash_drawer'
  | 'bank'
  | 'revenue_tuition'
  | 'revenue_retail'
  | 'revenue_locker'
  | 'discount'
  | 'refund'
  | 'trainer_payable'
  | 'opening_balance'
  | 'psp_fee'

export type Direction = 'debit' | 'credit'

export interface Entry {
  accountId: string
  direction: Direction
  amountRial: Rial
}

export interface Transaction {
  type: string
  entries: Entry[]
}

/** Accounts whose natural balance is a credit, so raw sums come out negative. */
const CREDIT_NATURED: ReadonlySet<AccountKind> = new Set<AccountKind>([
  'member_wallet',
  'revenue_tuition',
  'revenue_retail',
  'revenue_locker',
  'trainer_payable',
  'opening_balance',
])

const debit = (accountId: string, amountRial: Rial): Entry => ({
  accountId,
  direction: 'debit',
  amountRial,
})
const credit = (accountId: string, amountRial: Rial): Entry => ({
  accountId,
  direction: 'credit',
  amountRial,
})

export class UnbalancedTransactionError extends Error {
  constructor(
    readonly imbalanceRial: number,
    readonly type: string,
  ) {
    super(`ledger transaction "${type}" is unbalanced by ${imbalanceRial} rial`)
    this.name = 'UnbalancedTransactionError'
  }
}

/** Signed contribution of one entry: debit positive, credit negative. */
export function signedAmount(e: Entry): number {
  return e.direction === 'debit' ? e.amountRial : -e.amountRial
}

/**
 * Validate a transaction before it reaches the database.
 * @throws UnbalancedTransactionError when entries do not sum to zero
 */
export function assertBalanced(tx: Transaction): void {
  if (tx.entries.length < 2) {
    throw new Error(
      `ledger transaction "${tx.type}" has ${tx.entries.length} entries; at least 2 required`,
    )
  }
  for (const e of tx.entries) {
    if (!Number.isSafeInteger(e.amountRial)) {
      throw new Error(`entry amount must be a safe integer, got ${e.amountRial}`)
    }
    if (e.amountRial <= 0) {
      throw new Error(
        `entry amounts must be positive; express direction with debit/credit, not a negative amount`,
      )
    }
  }
  const imbalance = tx.entries.reduce((sum, e) => sum + signedAmount(e), 0)
  if (imbalance !== 0) throw new UnbalancedTransactionError(imbalance, tx.type)
}

/** Raw signed balance of one account across a set of entries. */
export function balanceOf(entries: readonly Entry[], accountId: string): Rial {
  return entries
    .filter((e) => e.accountId === accountId)
    .reduce((sum, e) => sum + signedAmount(e), 0)
}

/** Flip credit-natured accounts so humans see a positive number. */
export function displayBalance(kind: AccountKind, raw: Rial): Rial {
  return CREDIT_NATURED.has(kind) ? -raw : raw
}

/** Reverse a transaction. The only correct way to fix a posted mistake. */
export function reverse(tx: Transaction): Transaction {
  return {
    type: `reversal:${tx.type}`,
    entries: tx.entries.map((e) => ({
      ...e,
      direction: e.direction === 'debit' ? 'credit' : 'debit',
    })),
  }
}

/* ───────────────────────── transaction builders ───────────────────────── */

/**
 * Sell a membership. Revenue is recognised gross and the discount is posted to
 * its own account, so "how much did we discount this month" stays answerable —
 * which is also the fraud signal in design/permissions.md §2.
 */
export function membershipSale(a: {
  receivableId: string
  revenueId: string
  discountId?: string
  listPriceRial: Rial
  discountRial?: Rial
}): Transaction {
  const discount = a.discountRial ?? 0
  if (discount > a.listPriceRial) throw new Error('discount exceeds list price')
  if (discount > 0 && !a.discountId) {
    throw new Error('discountId is required when discountRial > 0')
  }
  const net = a.listPriceRial - discount
  const entries: Entry[] = [credit(a.revenueId, a.listPriceRial)]
  if (net > 0) entries.unshift(debit(a.receivableId, net))
  if (discount > 0) entries.push(debit(a.discountId!, discount))
  return { type: 'membership_sale', entries }
}

/** Receive money against what a member owes. Cash, card, transfer or bank. */
export function recordPayment(a: {
  intoAccountId: string
  receivableId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'payment',
    entries: [debit(a.intoAccountId, a.amountRial), credit(a.receivableId, a.amountRial)],
  }
}

/** Member prepays into their wallet. Liability to the gym increases. */
export function walletTopUp(a: {
  intoAccountId: string
  walletId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'wallet_topup',
    entries: [debit(a.intoAccountId, a.amountRial), credit(a.walletId, a.amountRial)],
  }
}

/** Buffet sale paid from the member's wallet. Liability decreases. */
export function posSaleFromWallet(a: {
  walletId: string
  revenueId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'pos_sale',
    entries: [debit(a.walletId, a.amountRial), credit(a.revenueId, a.amountRial)],
  }
}

export function posSaleCash(a: {
  intoAccountId: string
  revenueId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'pos_sale',
    entries: [debit(a.intoAccountId, a.amountRial), credit(a.revenueId, a.amountRial)],
  }
}

/**
 * Migrated debt from the previous system — one entry per member, no attempt to
 * reconstruct how the debt arose. See design/migration-extractor.md §1.
 */
export function openingBalance(a: {
  receivableId: string
  openingId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'opening_balance',
    entries: [debit(a.receivableId, a.amountRial), credit(a.openingId, a.amountRial)],
  }
}

/** Money returned to a member. */
export function refund(a: {
  fromAccountId: string
  refundId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'refund',
    entries: [debit(a.refundId, a.amountRial), credit(a.fromAccountId, a.amountRial)],
  }
}

/**
 * The PSP's cut on a direct-debit collection, posted separately so the gym can
 * see exactly what collection cost. Hiding the fee is how you lose trust in the
 * feature that earns it.
 */
export function pspFee(a: {
  bankId: string
  feeId: string
  amountRial: Rial
}): Transaction {
  return {
    type: 'psp_fee',
    entries: [debit(a.feeId, a.amountRial), credit(a.bankId, a.amountRial)],
  }
}

/* ───────────────────────────── PSP pricing ───────────────────────────── */

/**
 * Zarinpal direct-debit fee: 10,000 Rial fixed + 1%, the percentage capped at
 * 60,000 Rial per successful transaction.
 *
 * Because gym tuition is 10–40M Rial, the cap binds on every real collection —
 * the fee is effectively a flat 70,000 Rial (~7,000 Toman). That flatness is
 * what makes selective enrolment the right model: see design/direct-debit.md §2.
 *
 * NOT YET CONFIRMED with the provider — reading the published Persian as
 * "fixed + capped percentage". If the cap applies to the total instead, change
 * this function and revisit the pricing model.
 */
export const ZARINPAL_DD_FIXED_RIAL = 10_000
export const ZARINPAL_DD_PERCENT = 0.01
export const ZARINPAL_DD_PERCENT_CAP_RIAL = 60_000

export function zarinpalDirectDebitFee(amountRial: Rial): Rial {
  const pct = Math.min(
    Math.floor(amountRial * ZARINPAL_DD_PERCENT),
    ZARINPAL_DD_PERCENT_CAP_RIAL,
  )
  return ZARINPAL_DD_FIXED_RIAL + pct
}
