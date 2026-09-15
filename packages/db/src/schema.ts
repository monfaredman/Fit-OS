/**
 * GymOS database schema.
 *
 * Load-bearing conventions — see CLAUDE.md and design/domain-model.md:
 *
 *  1. Money is `bigint` integer RIAL. Never numeric, never float, never Toman.
 *  2. Balances are NEVER stored. A member's arrears is the balance of their
 *     `member_receivable` ledger account. See `v_member_arrears` in 0001_guards.
 *  3. Append-only tables (ledger_entry, check_in, stock_movement,
 *     sms_credit_ledger, audit_log) are enforced by triggers, not convention.
 *  4. Every tenant table carries `org_id` and is protected by RLS.
 *  5. Enum-ish columns are `text` with the allowed values named in a comment and
 *     validated in the app layer via @gymos/contracts (D-007). pgEnum makes
 *     adding a value a migration ordeal for no real safety gain here.
 *  6. `jalali_ym` is denormalised onto transactional tables: every report groups
 *     by Jalali month, and computing it per query is slow and error-prone.
 */

import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const money = (name: string) => bigint(name, { mode: 'number' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ───────────────────────── tenancy & identity ───────────────────────── */

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  nationalId: text('national_id'),
  economicCode: text('economic_code'),
  displayCurrency: text('display_currency').notNull().default('toman'), // toman | rial
  timezone: text('timezone').notNull().default('Asia/Tehran'),
  /** Door policy for members in arrears: block | warn | grace */
  arrearsPolicy: text('arrears_policy').notNull().default('warn'),
  arrearsGraceRial: money('arrears_grace_rial').notNull().default(500000),
  discountMaxPct: smallint('discount_max_pct').notNull().default(20),
  writeoffMaxRial: money('writeoff_max_rial').notNull().default(5000000),
  createdAt: ts('created_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const location = pgTable(
  'location',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('location_org_idx').on(t.orgId)],
);

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    mobile: text('mobile').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** owner | manager | receptionist | trainer | accountant */
    role: text('role').notNull(),
    passwordHash: text('password_hash'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('staff_org_mobile_uq').on(t.orgId, t.mobile)],
);

export const staffLocation = pgTable(
  'staff_location',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.locationId] })],
);

/** Opaque server-side sessions. Token is stored hashed, never in plaintext. */
export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    /** Elevated by OTP for owner-level actions. */
    elevatedUntil: ts('elevated_until'),
    createdAt: ts('created_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('session_token_uq').on(t.tokenHash),
    index('session_staff_idx').on(t.staffId),
  ],
);

/* ─────────────────────────────── people ───────────────────────────────
 * ONE table for leads and members, separated by `stage`. A lapsed member IS a
 * win-back lead; splitting the tables makes conversion a copy that loses
 * first-touch attribution. design/domain-model.md §1.3.
 * ------------------------------------------------------------------- */

export const person = pgTable(
  'person',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    homeLocationId: uuid('home_location_id').references(() => location.id, {
      onDelete: 'set null',
    }),

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** Normalised to 9XXXXXXXXX by @gymos/core normalizeMobile. */
    mobile: text('mobile').notNull(),
    /** Lowercased, ي→ی / ك→ک normalised, for search. Maintained on write. */
    searchName: text('search_name').notNull(),
    nationalId: text('national_id'),
    gender: text('gender'), // male | female
    birthDate: date('birth_date'),
    photoKey: text('photo_key'),

    /** lead | trial | active | frozen | arrears | lapsed | won_back | blocked */
    stage: text('stage').notNull().default('lead'),
    memberNo: integer('member_no'),
    source: text('source'), // instagram_dm | referral | walk_in | import | ...
    referredByPersonId: uuid('referred_by_person_id'),
    optedOutAt: ts('opted_out_at'),

    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    convertedAt: ts('converted_at'),
    lapsedAt: ts('lapsed_at'),

    notes: text('notes'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    // D-001 — reversible if gym visits show families sharing one number.
    uniqueIndex('person_org_mobile_uq').on(t.orgId, t.mobile),
    uniqueIndex('person_org_memberno_uq').on(t.orgId, t.memberNo),
    index('person_org_stage_idx').on(t.orgId, t.stage),
    index('person_org_search_idx').on(t.orgId, t.searchName),
  ],
);

/* ──────────────────────── plans & memberships ──────────────────────── */

export const plan = pgTable(
  'plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => location.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** duration | session_count | hybrid | open */
    kind: text('kind').notNull(),
    durationDays: integer('duration_days'),
    sessionCount: integer('session_count'),
    priceRial: money('price_rial').notNull(),
    genderRestriction: text('gender_restriction'),
    discipline: text('discipline'),
    /** Unused sessions carry over past the end date. Confirm per gym. */
    sessionsRollOver: boolean('sessions_roll_over').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('plan_org_idx').on(t.orgId)],
);

export const membership = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id),

    /** pending | active | frozen | expired | cancelled */
    status: text('status').notNull().default('pending'),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at'),
    sessionsTotal: integer('sessions_total'),
    sessionsUsed: integer('sessions_used').notNull().default(0),

    listPriceRial: money('list_price_rial').notNull(),
    discountRial: money('discount_rial').notNull().default(0),
    // NOTE: no paid/balance column. What is owed is the balance of this
    // person's member_receivable account. One source of truth.

    soldByStaffId: uuid('sold_by_staff_id').references(() => staff.id, { onDelete: 'set null' }),
    trainerId: uuid('trainer_id').references(() => staff.id, { onDelete: 'set null' }),

    jalaliYm: text('jalali_ym').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('membership_org_person_idx').on(t.orgId, t.personId),
    index('membership_org_status_ends_idx').on(t.orgId, t.status, t.endsAt),
    index('membership_jalali_idx').on(t.orgId, t.jalaliYm),
  ],
);

/** Append-only. Freezing extends membership.endsAt by daysCredited. */
export const membershipFreeze = pgTable(
  'membership_freeze',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    fromAt: ts('from_at').notNull(),
    toAt: ts('to_at'),
    daysCredited: integer('days_credited'),
    reason: text('reason'),
    createdByStaffId: uuid('created_by_staff_id').references(() => staff.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('freeze_membership_idx').on(t.membershipId)],
);

/* ───────────────────────────── the ledger ─────────────────────────────
 * Double entry. Entries of one transaction MUST sum to zero — enforced by a
 * deferred constraint trigger in 0001_guards.sql, not by application code.
 * ------------------------------------------------------------------- */

export const ledgerAccount = pgTable(
  'ledger_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** member_wallet | member_receivable | cash_drawer | bank | revenue_tuition
     *  | revenue_retail | revenue_locker | discount | refund | trainer_payable
     *  | opening_balance | psp_fee */
    kind: text('kind').notNull(),
    personId: uuid('person_id').references(() => person.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => location.id, { onDelete: 'set null' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_account_person_kind_uq').on(t.orgId, t.personId, t.kind),
    index('ledger_account_org_kind_idx').on(t.orgId, t.kind),
  ],
);

export const ledgerTransaction = pgTable(
  'ledger_transaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** membership_sale | payment | wallet_topup | pos_sale | locker_fee
     *  | opening_balance | refund | psp_fee | adjustment | reversal:* */
    type: text('type').notNull(),
    refTable: text('ref_table'),
    refId: uuid('ref_id'),
    memo: text('memo'),
    occurredAt: ts('occurred_at').notNull(),
    jalaliYm: text('jalali_ym').notNull(),
    createdByStaffId: uuid('created_by_staff_id').references(() => staff.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ltx_org_occurred_idx').on(t.orgId, t.occurredAt),
    index('ltx_ref_idx').on(t.refTable, t.refId),
    index('ltx_org_jalali_idx').on(t.orgId, t.jalaliYm),
  ],
);

/** IMMUTABLE. Corrections are reversing transactions, never edits. */
export const ledgerEntry = pgTable(
  'ledger_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransaction.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccount.id),
    /** debit | credit */
    direction: text('direction').notNull(),
    amountRial: money('amount_rial').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('lentry_account_idx').on(t.accountId), index('lentry_tx_idx').on(t.transactionId)],
);

/** Perf only. Rebuildable from entries at any time. Never authoritative. */
export const ledgerBalanceSnapshot = pgTable(
  'ledger_balance_snapshot',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccount.id, { onDelete: 'cascade' }),
    asOf: ts('as_of').notNull(),
    balanceRial: money('balance_rial').notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.asOf] })],
);

export const payment = pgTable(
  'payment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    /** cash | card_pos | card_transfer | gateway | direct_debit | wallet */
    method: text('method').notNull(),
    amountRial: money('amount_rial').notNull(),
    receivedAt: ts('received_at').notNull(),
    reference: text('reference'),
    collectionAttemptId: uuid('collection_attempt_id'),
    receivedByStaffId: uuid('received_by_staff_id').references(() => staff.id, {
      onDelete: 'set null',
    }),
    transactionId: uuid('transaction_id').references(() => ledgerTransaction.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('payment_org_person_idx').on(t.orgId, t.personId)],
);

/** Replay store for money-moving endpoints. design/api-design.md §4. */
export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] }), index('idem_expiry_idx').on(t.expiresAt)],
);

/* ──────────── direct debit — dormant until the PSP call (V1) ──────────── */

export const mandate = pgTable(
  'mandate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    /** pending | active | revoked | expired | failed */
    status: text('status').notNull().default('pending'),
    maxAmountRial: money('max_amount_rial'),
    maxPerMonth: integer('max_per_month'),
    authorizedAt: ts('authorized_at'),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('mandate_org_person_idx').on(t.orgId, t.personId)],
);

/** Append-only: a retry is a new row, never an update to the previous attempt. */
export const collectionAttempt = pgTable(
  'collection_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    mandateId: uuid('mandate_id')
      .notNull()
      .references(() => mandate.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').references(() => membership.id, { onDelete: 'set null' }),
    amountRial: money('amount_rial').notNull(),
    scheduledFor: ts('scheduled_for').notNull(),
    attemptNo: smallint('attempt_no').notNull().default(1),
    /** queued | submitted | succeeded | failed | abandoned */
    status: text('status').notNull().default('queued'),
    idempotencyKey: text('idempotency_key').notNull(),
    providerRef: text('provider_ref'),
    failureCode: text('failure_code'),
    feeRial: money('fee_rial'),
    settledAt: ts('settled_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_idem_uq').on(t.idempotencyKey),
    index('collection_due_idx').on(t.status, t.scheduledFor),
  ],
);

/* ───────────────────────── attendance & the door ─────────────────────────
 * The admission decision is PRECOMPUTED server-side so a kiosk can decide with
 * no network. A check-in is an append-only fact, so offline replay can never
 * conflict. design/offline-sync.md §1.
 * -------------------------------------------------------------------- */

export const accessSnapshot = pgTable(
  'access_snapshot',
  {
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    canEnter: boolean('can_enter').notNull(),
    /** ok | expired | arrears | no_sessions | frozen | wrong_gender_block | no_membership */
    reasonCode: text('reason_code'),
    membershipId: uuid('membership_id').references(() => membership.id, { onDelete: 'set null' }),
    sessionsRemaining: integer('sessions_remaining'),
    arrearsRial: money('arrears_rial').notNull().default(0),
    validUntil: ts('valid_until').notNull(),
    rev: bigint('rev', { mode: 'number' }).notNull().default(0),
    computedAt: ts('computed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.locationId] }),
    index('snapshot_org_rev_idx').on(t.orgId, t.locationId, t.rev),
  ],
);

/** Append-only fact. `clientEventId` makes offline replay idempotent. */
export const checkIn = pgTable(
  'check_in',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id),
    membershipId: uuid('membership_id').references(() => membership.id, { onDelete: 'set null' }),
    /** qr | card | fingerprint | face | manual | kiosk */
    method: text('method').notNull(),
    deviceId: uuid('device_id'),
    occurredAt: ts('occurred_at').notNull(),
    syncedAt: ts('synced_at'),
    wasOffline: boolean('was_offline').notNull().default(false),
    sessionConsumed: boolean('session_consumed').notNull().default(false),
    admitted: boolean('admitted').notNull().default(true),
    denialReason: text('denial_reason'),
    overriddenByStaffId: uuid('overridden_by_staff_id').references(() => staff.id, {
      onDelete: 'set null',
    }),
    clientEventId: text('client_event_id').notNull(),
    jalaliYm: text('jalali_ym').notNull(),
  },
  (t) => [
    uniqueIndex('checkin_client_event_uq').on(t.orgId, t.clientEventId),
    index('checkin_org_person_occurred_idx').on(t.orgId, t.personId, t.occurredAt),
    index('checkin_org_occurred_idx').on(t.orgId, t.occurredAt),
  ],
);

export const device = pgTable(
  'device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    /** kiosk | bridge | scanner */
    kind: text('kind').notNull(),
    label: text('label'),
    controllerModel: text('controller_model'),
    agentVersion: text('agent_version'),
    secretHash: text('secret_hash').notNull(),
    clockOffsetMs: integer('clock_offset_ms'),
    lastSeenAt: ts('last_seen_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('device_org_idx').on(t.orgId)],
);

/* ───────────────────────────── facilities ───────────────────────────── */

export const locker = pgTable(
  'locker',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    /** public | vip */
    kind: text('kind').notNull().default('public'),
    /** free | occupied | maintenance */
    status: text('status').notNull().default('free'),
    zone: text('zone'),
  },
  (t) => [uniqueIndex('locker_loc_code_uq').on(t.locationId, t.code)],
);

export const lockerAssignment = pgTable(
  'locker_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    lockerId: uuid('locker_id')
      .notNull()
      .references(() => locker.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    fromAt: ts('from_at').notNull(),
    toAt: ts('to_at'),
    priceRial: money('price_rial'),
    transactionId: uuid('transaction_id').references(() => ledgerTransaction.id),
  },
  (t) => [
    index('locker_assign_person_idx').on(t.orgId, t.personId),
    index('locker_assign_open_idx').on(t.lockerId, t.toAt),
  ],
);

/* ──────────────────────── buffet / retail on wallet ──────────────────────── */

export const product = pgTable(
  'product',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => location.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    sku: text('sku'),
    priceRial: money('price_rial').notNull(),
    tracksStock: boolean('tracks_stock').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [index('product_org_idx').on(t.orgId)],
);

export const stockMovement = pgTable('stock_movement', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => product.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  /** purchase | sale | waste | count */
  reason: text('reason').notNull(),
  refId: uuid('ref_id'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
});

export const posSale = pgTable('pos_sale', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id')
    .notNull()
    .references(() => location.id),
  personId: uuid('person_id').references(() => person.id, { onDelete: 'set null' }),
  totalRial: money('total_rial').notNull(),
  method: text('method').notNull(),
  transactionId: uuid('transaction_id').references(() => ledgerTransaction.id),
  soldByStaffId: uuid('sold_by_staff_id').references(() => staff.id, { onDelete: 'set null' }),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
  jalaliYm: text('jalali_ym').notNull(),
});

export const posSaleLine = pgTable('pos_sale_line', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => posSale.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => product.id),
  qty: integer('qty').notNull(),
  unitPriceRial: money('unit_price_rial').notNull(),
});

/* ──────────────────── automation engine + messaging ────────────────────
 * Two trigger sources, both required: `event` is the transactional outbox
 * (reactive), `scheduled_trigger` is materialised on write (proactive).
 * Never scan tables nightly. design/automation-engine.md §1.
 * -------------------------------------------------------------------- */

export const event = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    personId: uuid('person_id').references(() => person.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
  },
  (t) => [index('event_unprocessed_idx').on(t.processedAt, t.occurredAt)],
);

export const scheduledTrigger = pgTable(
  'scheduled_trigger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** membership_expiring | arrears_aging | lapsed | first_week | birthday */
    kind: text('kind').notNull(),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    refTable: text('ref_table'),
    refId: uuid('ref_id'),
    fireAt: ts('fire_at').notNull(),
    firedAt: ts('fired_at'),
    supersededAt: ts('superseded_at'),
  },
  (t) => [index('sched_due_idx').on(t.firedAt, t.fireAt)],
);

export const automation = pgTable(
  'automation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** expiry_7d | expiry_1d | lapsed_14d | arrears_reminder | birthday | first_week */
    recipeKey: text('recipe_key').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(false),
    config: jsonb('config').notNull().default({}),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('automation_org_recipe_uq').on(t.orgId, t.recipeKey)],
);

export const automationRun = pgTable(
  'automation_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    automationId: uuid('automation_id')
      .notNull()
      .references(() => automation.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    /** pending | sent | suppressed | failed */
    status: text('status').notNull().default('pending'),
    /** holdout | frequency_cap | collision | holiday | opted_out | frozen | no_credit */
    suppressedReason: text('suppressed_reason'),
    messageId: uuid('message_id'),
    ranAt: ts('ran_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('automation_run_idem_uq').on(t.idempotencyKey)],
);

export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    /** sms | whatsapp | push | in_app */
    channel: text('channel').notNull().default('sms'),
    templateKey: text('template_key'),
    body: text('body').notNull(),
    /** queued | sent | delivered | failed | suppressed | unknown */
    status: text('status').notNull().default('queued'),
    idempotencyKey: text('idempotency_key').notNull(),
    providerRef: text('provider_ref'),
    costRial: money('cost_rial'),
    segments: smallint('segments'),
    failureCode: text('failure_code'),
    sentAt: ts('sent_at'),
    deliveredAt: ts('delivered_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('message_idem_uq').on(t.idempotencyKey),
    index('message_org_person_idx').on(t.orgId, t.personId),
  ],
);

export const smsCreditLedger = pgTable(
  'sms_credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    refId: uuid('ref_id'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [index('sms_credit_org_idx').on(t.orgId, t.occurredAt)],
);

/* ──────────────────── retention intelligence (rules) ──────────────────── */

export const riskScore = pgTable(
  'risk_score',
  {
    personId: uuid('person_id')
      .primaryKey()
      .references(() => person.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    score: smallint('score').notNull(),
    /** low | medium | high */
    band: text('band').notNull(),
    /** [{ code, detail }] — the explanation is the product, not the score. */
    reasons: jsonb('reasons').notNull().default([]),
    recommendedAction: text('recommended_action'),
    computedAt: ts('computed_at').notNull().defaultNow(),
  },
  (t) => [index('risk_org_band_idx').on(t.orgId, t.band, t.score)],
);

/* ─────────────────────── migration / switch service ─────────────────────── */

export const importBatch = pgTable('import_batch', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  /** excel | csv | parsian | tanasob | mygym | bodysoft | other */
  source: text('source').notNull(),
  fileKey: text('file_key'),
  mapping: jsonb('mapping').notNull().default({}),
  /** draft | previewed | approved | imported | failed */
  status: text('status').notNull().default('draft'),
  stats: jsonb('stats').notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const importRow = pgTable(
  'import_row',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatch.id, { onDelete: 'cascade' }),
    rowNo: integer('row_no').notNull(),
    raw: jsonb('raw').notNull(),
    mapped: jsonb('mapped'),
    /** pending | ok | duplicate | invalid | imported */
    status: text('status').notNull().default('pending'),
    error: text('error'),
    createdEntityId: uuid('created_entity_id'),
  },
  (t) => [index('import_row_batch_idx').on(t.batchId, t.status)],
);

/* ───────────────────────────── calendar & audit ───────────────────────────── */

/** Iranian official holidays are irregular and announced — a table, not a constant. */
export const holiday = pgTable('holiday', {
  gregorianDate: date('gregorian_date').primaryKey(),
  jalaliDate: text('jalali_date').notNull(),
  name: text('name').notNull(),
  isOfficial: boolean('is_official').notNull().default(true),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorStaffId: uuid('actor_staff_id').references(() => staff.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [index('audit_org_occurred_idx').on(t.orgId, t.occurredAt)],
);

/* ──────────────────────────── inferred types ──────────────────────────── */

export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;
export type Location = typeof location.$inferSelect;
export type NewLocation = typeof location.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Person = typeof person.$inferSelect;
export type NewPerson = typeof person.$inferInsert;
export type Plan = typeof plan.$inferSelect;
export type NewPlan = typeof plan.$inferInsert;
export type Membership = typeof membership.$inferSelect;
export type NewMembership = typeof membership.$inferInsert;
export type MembershipFreeze = typeof membershipFreeze.$inferSelect;
export type NewMembershipFreeze = typeof membershipFreeze.$inferInsert;
export type LedgerAccount = typeof ledgerAccount.$inferSelect;
export type NewLedgerAccount = typeof ledgerAccount.$inferInsert;
export type LedgerTransaction = typeof ledgerTransaction.$inferSelect;
export type NewLedgerTransaction = typeof ledgerTransaction.$inferInsert;
export type LedgerEntry = typeof ledgerEntry.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntry.$inferInsert;
export type Payment = typeof payment.$inferSelect;
export type NewPayment = typeof payment.$inferInsert;
export type AccessSnapshot = typeof accessSnapshot.$inferSelect;
export type NewAccessSnapshot = typeof accessSnapshot.$inferInsert;
export type CheckIn = typeof checkIn.$inferSelect;
export type NewCheckIn = typeof checkIn.$inferInsert;
export type Locker = typeof locker.$inferSelect;
export type NewLocker = typeof locker.$inferInsert;
export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
export type RiskScore = typeof riskScore.$inferSelect;
export type NewRiskScore = typeof riskScore.$inferInsert;
