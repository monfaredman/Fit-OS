/**
 * GymOS — core domain schema (PostgreSQL / Drizzle)
 *
 * Conventions that are load-bearing. Breaking any of these is expensive later:
 *
 *  1. MONEY is integer RIAL, always. Never float, never Toman in storage.
 *     Toman is a display unit only (rial / 10). PSPs, banks, invoices and
 *     سامانه مودیان all speak Rial.
 *  2. BALANCES ARE NEVER STORED as mutable columns. Every money movement is a
 *     balanced double-entry `ledgerTransaction` + `ledgerEntry` rows. A member's
 *     arrears IS the balance of their receivable account; their wallet IS the
 *     balance of their wallet account. One mechanism, four features.
 *  3. FACTS ARE APPEND-ONLY: checkIn, ledgerEntry, collectionAttempt,
 *     membershipFreeze, stockMovement. Never UPDATE, never DELETE.
 *  4. TIMESTAMPS are timestamptz in UTC. Jalali is a presentation and a
 *     *bucketing* concern — see `jalaliYm` columns for report grouping.
 *  5. EVERY tenant-owned table carries orgId and is protected by RLS.
 *
 * Tables are tagged [MVP] [V1] [V2] so a solo build can be sequenced.
 */

import {
  pgTable, pgEnum, uuid, text, boolean, integer, bigint, jsonb,
  timestamp, date, uniqueIndex, index, primaryKey, smallint,
} from 'drizzle-orm/pg-core'

/* ─────────────────────────── enums ─────────────────────────── */

export const lifecycleStage = pgEnum('lifecycle_stage', [
  'lead', 'trial', 'active', 'frozen', 'arrears', 'lapsed', 'won_back', 'blocked',
])

export const planKind = pgEnum('plan_kind', [
  'duration',      // e.g. 1 month unlimited
  'session_count', // e.g. 12 / 16 / 24 sessions — the dominant Iranian model
  'hybrid',        // duration AND a session cap
  'open',          // pay-per-visit / drop-in
])

export const membershipStatus = pgEnum('membership_status', [
  'pending', 'active', 'frozen', 'expired', 'cancelled',
])

export const accountKind = pgEnum('account_kind', [
  'member_wallet',      // liability — money the gym holds for a member
  'member_receivable',  // asset — tuition owed by a member (arrears live here)
  'cash_drawer',
  'bank',
  'revenue_tuition',
  'revenue_retail',
  'revenue_locker',
  'discount',
  'refund',
  'trainer_payable',
])

export const entryDirection = pgEnum('entry_direction', ['debit', 'credit'])

export const paymentMethod = pgEnum('payment_method', [
  'cash', 'card_pos', 'card_transfer', 'gateway', 'direct_debit', 'wallet',
])

export const mandateStatus = pgEnum('mandate_status', [
  'pending', 'active', 'revoked', 'expired', 'failed',
])

export const collectionStatus = pgEnum('collection_status', [
  'queued', 'submitted', 'succeeded', 'failed', 'abandoned',
])

export const checkInMethod = pgEnum('check_in_method', [
  'qr', 'card', 'fingerprint', 'face', 'manual', 'kiosk',
])

export const lockerKind = pgEnum('locker_kind', ['public', 'vip'])
export const lockerStatus = pgEnum('locker_status', ['free', 'occupied', 'maintenance'])

export const messageChannel = pgEnum('message_channel', ['sms', 'whatsapp', 'push', 'in_app'])
export const messageStatus = pgEnum('message_status', [
  'queued', 'sent', 'delivered', 'failed', 'suppressed',
])

export const staffRole = pgEnum('staff_role', [
  'owner', 'manager', 'receptionist', 'trainer', 'accountant',
])

export const importSource = pgEnum('import_source', [
  'excel', 'csv', 'parsian', 'tanasob', 'mygym', 'bodysoft', 'other',
])

/* ───────────────────── tenancy & identity [MVP] ───────────────────── */

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  nationalId: text('national_id'),          // شناسه ملی
  economicCode: text('economic_code'),      // کد اقتصادی — needed for مودیان
  displayCurrency: text('display_currency').notNull().default('toman'), // toman | rial
  timezone: text('timezone').notNull().default('Asia/Tehran'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const location = pgTable('location', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [index('location_org_idx').on(t.orgId)])

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  mobile: text('mobile').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: staffRole('role').notNull(),
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [uniqueIndex('staff_org_mobile_uq').on(t.orgId, t.mobile)])

export const staffLocation = pgTable('staff_location', {
  staffId: uuid('staff_id').notNull().references(() => staff.id),
  locationId: uuid('location_id').notNull().references(() => location.id),
}, (t) => [primaryKey({ columns: [t.staffId, t.locationId] })])

/* ──────────────────────────── people [MVP] ────────────────────────────
 * DECISION: leads and members are ONE table with a lifecycle `stage`.
 * A lapsed member is a win-back lead — splitting the tables means conversion
 * is a copy that loses first-touch attribution and breaks the win-back loop,
 * which is the cheapest lead source a gym has.
 * ------------------------------------------------------------------ */

export const person = pgTable('person', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  homeLocationId: uuid('home_location_id').references(() => location.id),

  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  mobile: text('mobile').notNull(),          // the de-facto identity key in Iran
  nationalId: text('national_id'),           // کد ملی — optional, often not collected
  gender: text('gender'),                    // drives gendered time-block eligibility
  birthDate: date('birth_date'),
  photoKey: text('photo_key'),

  stage: lifecycleStage('stage').notNull().default('lead'),
  memberNo: integer('member_no'),            // human-facing شماره عضویت, per org
  source: text('source'),                    // 'instagram_dm' | 'referral' | 'walk_in' | ...
  referredByPersonId: uuid('referred_by_person_id'),

  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  lapsedAt: timestamp('lapsed_at', { withTimezone: true }),

  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('person_org_mobile_uq').on(t.orgId, t.mobile),
  uniqueIndex('person_org_memberno_uq').on(t.orgId, t.memberNo),
  index('person_org_stage_idx').on(t.orgId, t.stage),
])

/* ──────────────────── plans & memberships [MVP] ──────────────────── */

export const plan = pgTable('plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  locationId: uuid('location_id').references(() => location.id),

  name: text('name').notNull(),              // تعرفه
  kind: planKind('kind').notNull(),
  durationDays: integer('duration_days'),    // null for pure session_count
  sessionCount: integer('session_count'),    // null for pure duration
  priceRial: bigint('price_rial', { mode: 'number' }).notNull(),

  genderRestriction: text('gender_restriction'),
  discipline: text('discipline'),            // رشته — bodybuilding, TRX, yoga…
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('plan_org_idx').on(t.orgId)])

export const membership = pgTable('membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  planId: uuid('plan_id').notNull().references(() => plan.id),
  locationId: uuid('location_id').notNull().references(() => location.id),

  status: membershipStatus('status').notNull().default('pending'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),   // extended by freezes
  sessionsTotal: integer('sessions_total'),
  sessionsUsed: integer('sessions_used').notNull().default(0),

  listPriceRial: bigint('list_price_rial', { mode: 'number' }).notNull(),
  discountRial: bigint('discount_rial', { mode: 'number' }).notNull().default(0),
  // NOTE: no `paidRial` / `balanceRial` here. What is owed is the balance of
  // this person's member_receivable account. One source of truth.

  soldByStaffId: uuid('sold_by_staff_id').references(() => staff.id),
  trainerId: uuid('trainer_id').references(() => staff.id),

  jalaliYm: text('jalali_ym').notNull(),     // '1405-07' — report bucketing key
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('membership_org_person_idx').on(t.orgId, t.personId),
  index('membership_org_status_ends_idx').on(t.orgId, t.status, t.endsAt),
  index('membership_jalali_idx').on(t.orgId, t.jalaliYm),
])

/** Append-only. Freezing extends membership.endsAt by `daysCredited`. */
export const membershipFreeze = pgTable('membership_freeze', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  membershipId: uuid('membership_id').notNull().references(() => membership.id),
  fromAt: timestamp('from_at', { withTimezone: true }).notNull(),
  toAt: timestamp('to_at', { withTimezone: true }),
  daysCredited: integer('days_credited'),
  reason: text('reason'),
  createdByStaffId: uuid('created_by_staff_id').references(() => staff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('freeze_membership_idx').on(t.membershipId)])

/* ───────────────────── the ledger — money [MVP] ─────────────────────
 * Double entry. Every transaction's entries MUST sum to zero.
 * Enforce with a deferred constraint trigger; do not trust application code.
 * ------------------------------------------------------------------ */

export const ledgerAccount = pgTable('ledger_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  kind: accountKind('kind').notNull(),
  personId: uuid('person_id').references(() => person.id),   // for member_* kinds
  locationId: uuid('location_id').references(() => location.id), // for cash_drawer
  staffId: uuid('staff_id').references(() => staff.id),      // for trainer_payable
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('ledger_account_person_kind_uq').on(t.orgId, t.personId, t.kind),
  index('ledger_account_org_kind_idx').on(t.orgId, t.kind),
])

export const ledgerTransaction = pgTable('ledger_transaction', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  type: text('type').notNull(),   // 'membership_sale' | 'payment' | 'pos_sale' | 'locker_fee' | 'refund' | 'adjustment'
  refTable: text('ref_table'),
  refId: uuid('ref_id'),
  memo: text('memo'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  jalaliYm: text('jalali_ym').notNull(),
  createdByStaffId: uuid('created_by_staff_id').references(() => staff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('ltx_org_occurred_idx').on(t.orgId, t.occurredAt),
  index('ltx_ref_idx').on(t.refTable, t.refId),
])

/** IMMUTABLE. No updates, no deletes. Corrections are reversing transactions. */
export const ledgerEntry = pgTable('ledger_entry', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  transactionId: uuid('transaction_id').notNull().references(() => ledgerTransaction.id),
  accountId: uuid('account_id').notNull().references(() => ledgerAccount.id),
  direction: entryDirection('direction').notNull(),
  amountRial: bigint('amount_rial', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('lentry_account_idx').on(t.accountId),
  index('lentry_tx_idx').on(t.transactionId),
])

/** Perf only. Rebuildable from entries at any time. Never authoritative. */
export const ledgerBalanceSnapshot = pgTable('ledger_balance_snapshot', {
  accountId: uuid('account_id').notNull().references(() => ledgerAccount.id),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
  balanceRial: bigint('balance_rial', { mode: 'number' }).notNull(),
}, (t) => [primaryKey({ columns: [t.accountId, t.asOf] })])

export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  method: paymentMethod('method').notNull(),
  amountRial: bigint('amount_rial', { mode: 'number' }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  reference: text('reference'),              // RRN / tracking no / transfer ref
  collectionAttemptId: uuid('collection_attempt_id'),
  receivedByStaffId: uuid('received_by_staff_id').references(() => staff.id),
  transactionId: uuid('transaction_id').references(() => ledgerTransaction.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('payment_org_person_idx').on(t.orgId, t.personId)])

/* ─────────── direct debit — THE WEDGE [V1, schema now] ───────────
 * Modelled from day one even though it cannot be built until the legal
 * entity and PSP contract exist. A mandate is NOT a membership: a membership
 * is what the member bought, a mandate is the standing authority to collect
 * for it. Conflating them makes this unbuildable later.
 * ------------------------------------------------------------------ */

export const mandate = pgTable('mandate', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  provider: text('provider').notNull(),           // 'zarinpal' | ...
  providerRef: text('provider_ref'),
  status: mandateStatus('status').notNull().default('pending'),
  maxAmountRial: bigint('max_amount_rial', { mode: 'number' }),
  maxPerMonth: integer('max_per_month'),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('mandate_org_person_idx').on(t.orgId, t.personId)])

/** Append-only: one row per attempt. Retries are new rows, never updates. */
export const collectionAttempt = pgTable('collection_attempt', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  mandateId: uuid('mandate_id').notNull().references(() => mandate.id),
  membershipId: uuid('membership_id').references(() => membership.id),
  amountRial: bigint('amount_rial', { mode: 'number' }).notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  attemptNo: smallint('attempt_no').notNull().default(1),
  status: collectionStatus('status').notNull().default('queued'),
  idempotencyKey: text('idempotency_key').notNull(),
  providerRef: text('provider_ref'),
  failureCode: text('failure_code'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('collection_idem_uq').on(t.idempotencyKey),
  index('collection_due_idx').on(t.status, t.scheduledFor),
])

/* ───────────────── attendance & the door [MVP] ─────────────────
 * The offline requirement drives this design: the check-in decision must be
 * computable on the terminal with no network. That is only possible if the
 * decision is PRECOMPUTED server-side and cached. `accessSnapshot` is what the
 * PWA/kiosk holds in IndexedDB. Check-ins are append-only facts, so offline
 * sync can never conflict.
 * ------------------------------------------------------------------ */

export const accessSnapshot = pgTable('access_snapshot', {
  personId: uuid('person_id').notNull().references(() => person.id),
  locationId: uuid('location_id').notNull().references(() => location.id),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  canEnter: boolean('can_enter').notNull(),
  reasonCode: text('reason_code'),          // 'ok' | 'expired' | 'arrears' | 'no_sessions' | 'wrong_gender_block' | 'frozen'
  membershipId: uuid('membership_id').references(() => membership.id),
  sessionsRemaining: integer('sessions_remaining'),
  arrearsRial: bigint('arrears_rial', { mode: 'number' }).notNull().default(0),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.personId, t.locationId] }),
  index('snapshot_org_computed_idx').on(t.orgId, t.computedAt),
])

/** Append-only fact. `clientEventId` makes offline replay idempotent. */
export const checkIn = pgTable('check_in', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  locationId: uuid('location_id').notNull().references(() => location.id),
  membershipId: uuid('membership_id').references(() => membership.id),
  method: checkInMethod('method').notNull(),
  deviceId: uuid('device_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  wasOffline: boolean('was_offline').notNull().default(false),
  sessionConsumed: boolean('session_consumed').notNull().default(false),
  admitted: boolean('admitted').notNull().default(true),
  denialReason: text('denial_reason'),
  clientEventId: text('client_event_id').notNull(),
  jalaliYm: text('jalali_ym').notNull(),
}, (t) => [
  uniqueIndex('checkin_client_event_uq').on(t.orgId, t.clientEventId),
  index('checkin_org_person_occurred_idx').on(t.orgId, t.personId, t.occurredAt),
  index('checkin_org_occurred_idx').on(t.orgId, t.occurredAt),
])

export const device = pgTable('device', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  locationId: uuid('location_id').notNull().references(() => location.id),
  kind: text('kind').notNull(),             // 'kiosk' | 'bridge' | 'scanner'
  label: text('label'),
  controllerModel: text('controller_model'), // populated by the hardware bridge
  agentVersion: text('agent_version'),
  secretHash: text('secret_hash').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('device_org_idx').on(t.orgId)])

/* ───────────────────────── lockers [MVP] ───────────────────────── */

export const locker = pgTable('locker', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  locationId: uuid('location_id').notNull().references(() => location.id),
  code: text('code').notNull(),
  kind: lockerKind('kind').notNull().default('public'),
  status: lockerStatus('status').notNull().default('free'),
  zone: text('zone'),
}, (t) => [uniqueIndex('locker_loc_code_uq').on(t.locationId, t.code)])

export const lockerAssignment = pgTable('locker_assignment', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  lockerId: uuid('locker_id').notNull().references(() => locker.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  kind: lockerKind('kind').notNull(),
  fromAt: timestamp('from_at', { withTimezone: true }).notNull(),
  toAt: timestamp('to_at', { withTimezone: true }),
  priceRial: bigint('price_rial', { mode: 'number' }),   // VIP only → ledger txn
  transactionId: uuid('transaction_id').references(() => ledgerTransaction.id),
}, (t) => [
  index('locker_assign_person_idx').on(t.orgId, t.personId),
  index('locker_assign_open_idx').on(t.lockerId, t.toAt),
])

/* ──────────────── buffet / retail on the wallet [MVP] ──────────────── */

export const product = pgTable('product', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  locationId: uuid('location_id').references(() => location.id),
  name: text('name').notNull(),
  sku: text('sku'),
  priceRial: bigint('price_rial', { mode: 'number' }).notNull(),
  tracksStock: boolean('tracks_stock').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [index('product_org_idx').on(t.orgId)])

export const stockMovement = pgTable('stock_movement', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  productId: uuid('product_id').notNull().references(() => product.id),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),          // 'purchase' | 'sale' | 'waste' | 'count'
  refId: uuid('ref_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export const posSale = pgTable('pos_sale', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  locationId: uuid('location_id').notNull().references(() => location.id),
  personId: uuid('person_id').references(() => person.id),   // null = walk-in cash
  totalRial: bigint('total_rial', { mode: 'number' }).notNull(),
  method: paymentMethod('method').notNull(),
  transactionId: uuid('transaction_id').references(() => ledgerTransaction.id),
  soldByStaffId: uuid('sold_by_staff_id').references(() => staff.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  jalaliYm: text('jalali_ym').notNull(),
})

export const posSaleLine = pgTable('pos_sale_line', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => posSale.id),
  productId: uuid('product_id').notNull().references(() => product.id),
  qty: integer('qty').notNull(),
  unitPriceRial: bigint('unit_price_rial', { mode: 'number' }).notNull(),
})

/* ────────── automation engine + messaging [MVP] ──────────
 * Two trigger sources, both required:
 *   event  — reactive  ("member checked in")     → transactional outbox
 *   scheduledTrigger — proactive ("expires in 7 days") → materialised on write
 * Do NOT implement proactive triggers as a nightly full-table scan; materialise
 * the fire time when the membership is written and recompute on change.
 * ------------------------------------------------------------------ */

export const event = pgTable('event', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  type: text('type').notNull(),
  personId: uuid('person_id').references(() => person.id),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (t) => [index('event_unprocessed_idx').on(t.processedAt, t.occurredAt)])

export const scheduledTrigger = pgTable('scheduled_trigger', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  kind: text('kind').notNull(),              // 'membership_expiring' | 'arrears_aging' | 'lapsed'
  personId: uuid('person_id').notNull().references(() => person.id),
  refTable: text('ref_table'),
  refId: uuid('ref_id'),
  fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
  firedAt: timestamp('fired_at', { withTimezone: true }),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
}, (t) => [index('sched_due_idx').on(t.firedAt, t.fireAt)])

export const automation = pgTable('automation', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  recipeKey: text('recipe_key').notNull(),   // 'expiry_7d' | 'expiry_1d' | 'lapsed_14d' | 'arrears_reminder' | 'birthday' | 'first_week'
  isEnabled: boolean('is_enabled').notNull().default(false),
  config: jsonb('config').notNull().default({}),  // offsets, template text, quiet hours
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('automation_org_recipe_uq').on(t.orgId, t.recipeKey)])

export const automationRun = pgTable('automation_run', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  automationId: uuid('automation_id').notNull().references(() => automation.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('pending'),
  messageId: uuid('message_id'),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('automation_run_idem_uq').on(t.idempotencyKey)])

/** Every send carries an idempotency key. A retry that double-sends costs the
 *  gym real money and generates a support incident. */
export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  personId: uuid('person_id').notNull().references(() => person.id),
  channel: messageChannel('channel').notNull().default('sms'),
  templateKey: text('template_key'),
  body: text('body').notNull(),
  status: messageStatus('status').notNull().default('queued'),
  idempotencyKey: text('idempotency_key').notNull(),
  providerRef: text('provider_ref'),
  costRial: bigint('cost_rial', { mode: 'number' }),
  segments: smallint('segments'),
  failureCode: text('failure_code'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('message_idem_uq').on(t.idempotencyKey),
  index('message_org_person_idx').on(t.orgId, t.personId),
])

export const smsCreditLedger = pgTable('sms_credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  delta: integer('delta').notNull(),         // + purchase, − send
  reason: text('reason').notNull(),
  refId: uuid('ref_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sms_credit_org_idx').on(t.orgId, t.occurredAt)])

/* ───────────── retention intelligence — rules based [MVP] ─────────────
 * `reasons` is the point. The report's requirement is detect → EXPLAIN →
 * recommend → automate. A score with no explanation is unsellable.
 * ------------------------------------------------------------------ */

export const riskScore = pgTable('risk_score', {
  personId: uuid('person_id').notNull().references(() => person.id),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  score: smallint('score').notNull(),        // 0–100
  band: text('band').notNull(),              // 'low' | 'medium' | 'high'
  reasons: jsonb('reasons').notNull().default([]),
  // [{ code:'attendance_drop', detail:'3 visits last 14d vs personal baseline 9' },
  //  { code:'expiring', detail:'membership ends in 5 days' },
  //  { code:'arrears', detail:'owes 4,200,000 rial for 23 days' }]
  recommendedAction: text('recommended_action'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.personId] }),
  index('risk_org_band_idx').on(t.orgId, t.band, t.score),
])

/* ─────────────── migration / switch service [MVP] ─────────────── */

export const importBatch = pgTable('import_batch', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  source: importSource('source').notNull(),
  fileKey: text('file_key'),
  mapping: jsonb('mapping').notNull().default({}),
  status: text('status').notNull().default('draft'),  // draft|previewed|approved|imported|failed
  stats: jsonb('stats').notNull().default({}),        // counts, duplicates, invalid
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const importRow = pgTable('import_row', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => importBatch.id),
  rowNo: integer('row_no').notNull(),
  raw: jsonb('raw').notNull(),
  mapped: jsonb('mapped'),
  status: text('status').notNull().default('pending'), // pending|ok|duplicate|invalid|imported
  error: text('error'),
  createdEntityId: uuid('created_entity_id'),
}, (t) => [index('import_row_batch_idx').on(t.batchId, t.status)])

/* ───────────────────── calendar & audit [MVP] ───────────────────── */

/** Iranian official holidays are irregular and announced — a table, not a
 *  library constant. Drives automation quiet-hours and capacity reporting. */
export const holiday = pgTable('holiday', {
  gregorianDate: date('gregorian_date').primaryKey(),
  jalaliDate: text('jalali_date').notNull(),
  name: text('name').notNull(),
  isOfficial: boolean('is_official').notNull().default(true),
})

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organization.id),
  actorStaffId: uuid('actor_staff_id').references(() => staff.id),
  action: text('action').notNull(),
  entityTable: text('entity_table').notNull(),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_org_occurred_idx').on(t.orgId, t.occurredAt)])

/* ───────────────── deferred to V1/V2 — stubs only ─────────────────
 * booking / session / waitlist          [V1] open-floor market, demoted
 * workoutProgram / nutritionProgram     [V1] consider partnering instead
 * bodyMeasurement                       [V1]
 * trainerCommissionRule / settlement    [V1]
 * corporateAccount / corporateSeat      [V2]
 * invoice / moadianSubmission           [V2] validate obligation first
 * ------------------------------------------------------------------ */
