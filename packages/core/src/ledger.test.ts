import { describe, it, expect } from 'vitest'
import {
  assertBalanced, balanceOf, displayBalance, reverse,
  membershipSale, recordPayment, walletTopUp, posSaleFromWallet, posSaleCash,
  openingBalance, refund, pspFee, zarinpalDirectDebitFee,
  UnbalancedTransactionError, type Entry, type Transaction,
} from './ledger.js'
import { formatTomanLatin, tomanToRial } from './money.js'

// Account ids for a single gym and one member
const RECEIVABLE = 'acct:member:ali:receivable'
const WALLET = 'acct:member:ali:wallet'
const DRAWER = 'acct:loc:main:cash'
const BANK = 'acct:org:bank'
const TUITION = 'acct:org:revenue_tuition'
const RETAIL = 'acct:org:revenue_retail'
const DISCOUNT = 'acct:org:discount'
const REFUND = 'acct:org:refund'
const OPENING = 'acct:org:opening'
const FEE = 'acct:org:psp_fee'

const T = (toman: number) => tomanToRial(toman)
const post = (all: Entry[], tx: Transaction) => {
  assertBalanced(tx)
  all.push(...tx.entries)
  return all
}

describe('the balance invariant', () => {
  it('accepts a balanced transaction', () => {
    expect(() =>
      assertBalanced(recordPayment({ intoAccountId: DRAWER, receivableId: RECEIVABLE, amountRial: T(100_000) })),
    ).not.toThrow()
  })

  it('rejects an unbalanced transaction and reports the imbalance', () => {
    const bad: Transaction = {
      type: 'handmade',
      entries: [
        { accountId: DRAWER, direction: 'debit', amountRial: T(100_000) },
        { accountId: RECEIVABLE, direction: 'credit', amountRial: T(90_000) },
      ],
    }
    expect(() => assertBalanced(bad)).toThrow(UnbalancedTransactionError)
    try {
      assertBalanced(bad)
    } catch (e) {
      expect((e as UnbalancedTransactionError).imbalanceRial).toBe(T(10_000))
    }
  })

  it('rejects a single-entry transaction', () => {
    expect(() =>
      assertBalanced({ type: 'x', entries: [{ accountId: DRAWER, direction: 'debit', amountRial: 100 }] }),
    ).toThrow(/at least 2 required/)
  })

  it('rejects negative amounts — direction carries the sign, not the number', () => {
    expect(() =>
      assertBalanced({
        type: 'x',
        entries: [
          { accountId: DRAWER, direction: 'debit', amountRial: -100 },
          { accountId: TUITION, direction: 'credit', amountRial: -100 },
        ],
      }),
    ).toThrow(/must be positive/)
  })

  it('rejects non-integer amounts', () => {
    expect(() =>
      assertBalanced({
        type: 'x',
        entries: [
          { accountId: DRAWER, direction: 'debit', amountRial: 100.5 },
          { accountId: TUITION, direction: 'credit', amountRial: 100.5 },
        ],
      }),
    ).toThrow(/safe integer/)
  })

  it('balances every builder in the module', () => {
    const txs = [
      membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, listPriceRial: T(2_500_000) }),
      membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, discountId: DISCOUNT, listPriceRial: T(2_500_000), discountRial: T(300_000) }),
      recordPayment({ intoAccountId: DRAWER, receivableId: RECEIVABLE, amountRial: T(1_500_000) }),
      walletTopUp({ intoAccountId: DRAWER, walletId: WALLET, amountRial: T(200_000) }),
      posSaleFromWallet({ walletId: WALLET, revenueId: RETAIL, amountRial: T(35_000) }),
      posSaleCash({ intoAccountId: DRAWER, revenueId: RETAIL, amountRial: T(15_000) }),
      openingBalance({ receivableId: RECEIVABLE, openingId: OPENING, amountRial: T(420_000) }),
      refund({ fromAccountId: DRAWER, refundId: REFUND, amountRial: T(500_000) }),
      pspFee({ bankId: BANK, feeId: FEE, amountRial: 70_000 }),
    ]
    for (const tx of txs) expect(() => assertBalanced(tx)).not.toThrow()
  })
})

describe('the worked example from domain-model.md §3', () => {
  // Member buys a 2,500,000 Toman month and pays 1,500,000 in cash.
  const entries: Entry[] = []
  post(entries, membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, listPriceRial: T(2_500_000) }))
  post(entries, recordPayment({ intoAccountId: DRAWER, receivableId: RECEIVABLE, amountRial: T(1_500_000) }))

  it('leaves the member owing exactly 1,000,000 Toman', () => {
    expect(formatTomanLatin(balanceOf(entries, RECEIVABLE))).toBe('1,000,000')
  })
  it('puts the cash in the drawer', () => {
    expect(formatTomanLatin(balanceOf(entries, DRAWER))).toBe('1,500,000')
  })
  it('recognises the full tuition as revenue, not just what was collected', () => {
    expect(formatTomanLatin(displayBalance('revenue_tuition', balanceOf(entries, TUITION)))).toBe('2,500,000')
  })
  it('keeps the whole book balanced', () => {
    expect(entries.reduce((s, e) => s + (e.direction === 'debit' ? e.amountRial : -e.amountRial), 0)).toBe(0)
  })
})

describe('direct debit posts identically to cash', () => {
  // The claim in domain-model.md §3: arrears gains a payment rail without the
  // feature changing at all. Same shape, `bank` instead of `cash_drawer`.
  const cashBook: Entry[] = []
  post(cashBook, membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, listPriceRial: T(2_500_000) }))
  post(cashBook, recordPayment({ intoAccountId: DRAWER, receivableId: RECEIVABLE, amountRial: T(2_500_000) }))

  const ddBook: Entry[] = []
  post(ddBook, membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, listPriceRial: T(2_500_000) }))
  post(ddBook, recordPayment({ intoAccountId: BANK, receivableId: RECEIVABLE, amountRial: T(2_500_000) }))

  it('clears the arrears either way', () => {
    expect(balanceOf(cashBook, RECEIVABLE)).toBe(0)
    expect(balanceOf(ddBook, RECEIVABLE)).toBe(0)
  })
  it('recognises the same revenue either way', () => {
    expect(balanceOf(cashBook, TUITION)).toBe(balanceOf(ddBook, TUITION))
  })
})

describe('discounts stay visible', () => {
  const entries: Entry[] = []
  post(entries, membershipSale({
    receivableId: RECEIVABLE, revenueId: TUITION, discountId: DISCOUNT,
    listPriceRial: T(2_500_000), discountRial: T(300_000),
  }))

  it('bills the member the net amount', () => {
    expect(formatTomanLatin(balanceOf(entries, RECEIVABLE))).toBe('2,200,000')
  })
  it('recognises revenue gross', () => {
    expect(formatTomanLatin(displayBalance('revenue_tuition', balanceOf(entries, TUITION)))).toBe('2,500,000')
  })
  it('records the discount separately — the fraud signal in permissions.md §2', () => {
    expect(formatTomanLatin(balanceOf(entries, DISCOUNT))).toBe('300,000')
  })
  it('handles a 100% discount without creating a zero-amount entry', () => {
    const tx = membershipSale({
      receivableId: RECEIVABLE, revenueId: TUITION, discountId: DISCOUNT,
      listPriceRial: T(2_500_000), discountRial: T(2_500_000),
    })
    expect(() => assertBalanced(tx)).not.toThrow()
    expect(tx.entries).toHaveLength(2)
    expect(balanceOf(tx.entries, RECEIVABLE)).toBe(0)
  })
  it('refuses a discount larger than the price', () => {
    expect(() => membershipSale({
      receivableId: RECEIVABLE, revenueId: TUITION, discountId: DISCOUNT,
      listPriceRial: T(100_000), discountRial: T(200_000),
    })).toThrow(/exceeds list price/)
  })
  it('refuses a discount with nowhere to post it', () => {
    expect(() => membershipSale({
      receivableId: RECEIVABLE, revenueId: TUITION,
      listPriceRial: T(100_000), discountRial: T(10_000),
    })).toThrow(/discountId is required/)
  })
})

describe('the wallet is a liability, not an asset', () => {
  const entries: Entry[] = []
  post(entries, walletTopUp({ intoAccountId: DRAWER, walletId: WALLET, amountRial: T(200_000) }))
  post(entries, posSaleFromWallet({ walletId: WALLET, revenueId: RETAIL, amountRial: T(35_000) }))

  it('holds a raw negative balance — the gym owes the member', () => {
    expect(balanceOf(entries, WALLET)).toBe(-T(165_000))
  })
  it('reads positive to a human', () => {
    expect(formatTomanLatin(displayBalance('member_wallet', balanceOf(entries, WALLET)))).toBe('165,000')
  })
  it('moves prepaid money into retail revenue when spent', () => {
    expect(formatTomanLatin(displayBalance('revenue_retail', balanceOf(entries, RETAIL)))).toBe('35,000')
  })
})

describe('migrated opening balances', () => {
  it('creates arrears without reconstructing history', () => {
    const entries: Entry[] = []
    post(entries, openingBalance({ receivableId: RECEIVABLE, openingId: OPENING, amountRial: T(420_000) }))
    expect(formatTomanLatin(balanceOf(entries, RECEIVABLE))).toBe('420,000')
    expect(formatTomanLatin(displayBalance('opening_balance', balanceOf(entries, OPENING)))).toBe('420,000')
  })
})

describe('corrections are reversals, never edits', () => {
  it('a reversal returns every account to where it started', () => {
    const tx = membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, listPriceRial: T(2_500_000) })
    const entries = [...tx.entries, ...reverse(tx).entries]
    expect(balanceOf(entries, RECEIVABLE)).toBe(0)
    expect(balanceOf(entries, TUITION)).toBe(0)
  })
  it('a reversal is itself balanced', () => {
    const tx = recordPayment({ intoAccountId: DRAWER, receivableId: RECEIVABLE, amountRial: T(1_000_000) })
    expect(() => assertBalanced(reverse(tx))).not.toThrow()
  })
})

describe('a full month for one member', () => {
  // Opening debt, a sale, a partial payment, a wallet top-up and two buffet buys.
  const e: Entry[] = []
  post(e, openingBalance({ receivableId: RECEIVABLE, openingId: OPENING, amountRial: T(420_000) }))
  post(e, membershipSale({ receivableId: RECEIVABLE, revenueId: TUITION, discountId: DISCOUNT, listPriceRial: T(2_500_000), discountRial: T(200_000) }))
  post(e, recordPayment({ intoAccountId: DRAWER, receivableId: RECEIVABLE, amountRial: T(2_000_000) }))
  post(e, walletTopUp({ intoAccountId: DRAWER, walletId: WALLET, amountRial: T(100_000) }))
  post(e, posSaleFromWallet({ walletId: WALLET, revenueId: RETAIL, amountRial: T(25_000) }))
  post(e, posSaleFromWallet({ walletId: WALLET, revenueId: RETAIL, amountRial: T(18_000) }))

  it('owes 420,000 + 2,300,000 − 2,000,000 = 720,000', () => {
    expect(formatTomanLatin(balanceOf(e, RECEIVABLE))).toBe('720,000')
  })
  it('has 57,000 left in the wallet', () => {
    expect(formatTomanLatin(displayBalance('member_wallet', balanceOf(e, WALLET)))).toBe('57,000')
  })
  it('put 2,100,000 in the drawer', () => {
    expect(formatTomanLatin(balanceOf(e, DRAWER))).toBe('2,100,000')
  })
  it('still balances to zero across every account', () => {
    expect(e.reduce((s, x) => s + (x.direction === 'debit' ? x.amountRial : -x.amountRial), 0)).toBe(0)
  })
})

describe('Zarinpal direct-debit fee', () => {
  it('caps the percentage, making the fee flat for real tuition', () => {
    // 10,000 fixed + min(1%, 60,000). Every gym tuition hits the cap.
    expect(zarinpalDirectDebitFee(T(600_000))).toBe(70_000)
    expect(zarinpalDirectDebitFee(T(2_500_000))).toBe(70_000)
    expect(zarinpalDirectDebitFee(T(6_000_000))).toBe(70_000)
  })
  it('charges the true percentage below the cap', () => {
    expect(zarinpalDirectDebitFee(T(100_000))).toBe(10_000 + 10_000)
  })
  it('is about 7,000 Toman on a typical collection', () => {
    expect(formatTomanLatin(zarinpalDirectDebitFee(T(2_500_000)))).toBe('7,000')
  })
  it('costs a 600-member gym ~4.2M Toman a month if it collects everything', () => {
    // The number behind direct-debit.md §2: enrol selectively, because this
    // exceeds the gym's own 3.4M subscription.
    const monthly = 600 * zarinpalDirectDebitFee(T(2_500_000))
    expect(formatTomanLatin(monthly)).toBe('4,200,000')
  })
})
