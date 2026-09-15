/**
 * Seed a realistic Iranian gym.
 *
 * Realism is the point — `ai/dev-workflow.md` §5. A believable seed surfaces the
 * ي/ی search bug, the RTL number bug and the slow query on day one instead of at
 * a customer. It produces:
 *
 *   - one org, one location, three staff
 *   - session-count AND duration plans (the Iranian mix)
 *   - ~600 members, Persian names, ~15% spelled with Arabic codepoints
 *   - ~30% carrying arrears aged 3–90 days
 *   - a slice frozen, a slice lapsed, a slice still leads
 *   - 90 days of attendance with per-member baselines
 *   - lockers, buffet products, access snapshots
 *
 * Idempotent: re-running wipes and rebuilds the seeded org only.
 *
 * Runs as the OWNER connection, which bypasses RLS — correct for seeding.
 * Every ledger posting goes through @gymos/core builders and is inserted inside
 * one transaction, because the balance trigger is DEFERRABLE INITIALLY DEFERRED
 * and fires at COMMIT.
 */

import { loadConfig } from '@gymos/config';
import {
  membershipSale,
  openingBalance,
  recordPayment,
  walletTopUp,
  assertBalanced,
  jalaliYm,
  addDays,
  formatTomanLatin,
  hashPassword,
  normalizePersianText,
  type Transaction,
} from '@gymos/core';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema.js';
import * as s2 from './schema.js';
import {
  DISCIPLINES,
  FEMALE_FIRST,
  LAST,
  MALE_FIRST,
  PRODUCTS,
  toArabicSpelling,
} from './seed-data/names.js';

/* ----------------------------- deterministic RNG ----------------------------- */
// Seeded so two runs produce the same gym — makes "it worked yesterday" debuggable.
let rngState = 0x2f6e2b1;
function rnd(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return ((rngState >>> 0) % 1_000_000) / 1_000_000;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const int = (min: number, max: number): number => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number): boolean => rnd() < p;

const DAY = 86_400_000;
/**
 * Tables carrying append-only triggers. Only these need suspending for an
 * administrative wipe — and only their USER triggers, never system triggers.
 */
const APPEND_ONLY_TABLES = [
  'ledger_entry',
  'check_in',
  'stock_movement',
  'sms_credit_ledger',
  'audit_log',
] as const;

/** Seeded staff password. Development only. */
const DEV_PASSWORD = 'gymos1234';
const T = (toman: number): number => toman * 10;

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, close } = createDb(config.DATABASE_URL);
  const memberCount = config.SEED_MEMBER_COUNT;
  const now = new Date();

  try {
    // ---- wipe just this org -------------------------------------------------
    const existing = await db
      .select({ id: s.organization.id })
      .from(s.organization)
      .where(eq(s.organization.name, config.SEED_ORG_NAME))
      .limit(1);
    if (existing[0]) {
      // The append-only triggers reject the cascade DELETE on check_in,
      // ledger_entry and audit_log — correctly: append-only means append-only.
      //
      // `session_replication_role = replica` looks like the fix and is a TRAP:
      // it disables *system* triggers too, which is how Postgres implements
      // foreign keys. The parent row goes away and every child is silently
      // orphaned. `DISABLE TRIGGER USER` suspends only our own triggers and
      // leaves FK cascades working. ALTER TABLE is transactional, so a failure
      // rolls the disable back with everything else.
      await db.transaction(async (tx) => {
        for (const t of APPEND_ONLY_TABLES) {
          await tx.execute(sql.raw(`ALTER TABLE ${t} DISABLE TRIGGER USER`));
        }
        await tx.delete(s2.organization).where(eq(s2.organization.id, existing[0]!.id));
        for (const t of APPEND_ONLY_TABLES) {
          await tx.execute(sql.raw(`ALTER TABLE ${t} ENABLE TRIGGER USER`));
        }
      });
      console.log('Removed previous seed org (cascade intact, user triggers suspended).');
    }

    // ---- org, location, staff ----------------------------------------------
    const orgId = randomUUID();
    await db.insert(s.organization).values({
      id: orgId,
      name: config.SEED_ORG_NAME,
      legalName: `${config.SEED_ORG_NAME} (سهامی خاص)`,
      arrearsPolicy: 'warn',
      arrearsGraceRial: config.ARREARS_GRACE_RIAL,
      discountMaxPct: config.DISCOUNT_MAX_PCT,
      writeoffMaxRial: config.WRITEOFF_MAX_RIAL,
    });

    const locationId = randomUUID();
    await db.insert(s.location).values({
      id: locationId,
      orgId,
      name: 'شعبه مرکزی',
      address: 'تهران، سعادت‌آباد',
      phone: '02122365531',
      isPrimary: true,
    });

    const staffRows = [
      { role: 'owner', firstName: 'کاوه', lastName: 'مرادی', mobile: '9121111111' },
      { role: 'manager', firstName: 'شیرین', lastName: 'طاهری', mobile: '9122222222' },
      { role: 'receptionist', firstName: 'زهرا', lastName: 'نوری', mobile: '9123333333' },
      { role: 'trainer', firstName: 'آرش', lastName: 'بهرامی', mobile: '9124444444' },
    ].map((x) => ({ id: randomUUID(), orgId, ...x, isActive: true }));

    // Development password for every seeded staff member. Never used outside
    // the seed — production accounts are created through the API.
    const devPasswordHash = await hashPassword(DEV_PASSWORD);
    await db.insert(s.staff).values(staffRows.map((x) => ({ ...x, passwordHash: devPasswordHash })));
    await db.insert(s.staffLocation).values(staffRows.map((x) => ({ staffId: x.id, locationId })));
    const receptionistId = staffRows[2]!.id;

    // ---- plans: the Iranian mix, session-count first ------------------------
    const plans = [
      { name: 'بدنسازی — ۱۲ جلسه', kind: 'session_count', sessionCount: 12, durationDays: 30, priceRial: T(2_200_000) },
      { name: 'بدنسازی — ۱۶ جلسه', kind: 'session_count', sessionCount: 16, durationDays: 30, priceRial: T(2_700_000) },
      { name: 'بدنسازی — ۲۴ جلسه', kind: 'session_count', sessionCount: 24, durationDays: 30, priceRial: T(3_400_000) },
      { name: 'فیتنس — یک ماهه آزاد', kind: 'duration', sessionCount: null, durationDays: 30, priceRial: T(3_900_000) },
      { name: 'فیتنس — سه ماهه آزاد', kind: 'duration', sessionCount: null, durationDays: 90, priceRial: T(10_200_000) },
      { name: 'TRX — ۱۲ جلسه', kind: 'session_count', sessionCount: 12, durationDays: 30, priceRial: T(2_900_000) },
    ].map((p) => ({
      id: randomUUID(),
      orgId,
      locationId,
      discipline: pick(DISCIPLINES),
      sessionsRollOver: false,
      isActive: true,
      ...p,
    }));
    await db.insert(s.plan).values(plans);

    // ---- org-level ledger accounts -----------------------------------------
    const acct = (kind: string): { id: string; orgId: string; kind: string } => ({
      id: randomUUID(),
      orgId,
      kind,
    });
    const revTuition = acct('revenue_tuition');
    const revRetail = acct('revenue_retail');
    const discountAcct = acct('discount');
    const openingAcct = acct('opening_balance');
    const drawer = { ...acct('cash_drawer'), locationId };
    const bank = acct('bank');
    await db
      .insert(s.ledgerAccount)
      .values([revTuition, revRetail, discountAcct, openingAcct, drawer, bank]);

    // ---- people -------------------------------------------------------------
    type Posting = { tx: Transaction; occurredAt: Date; type: string; refId?: string };

    const people: (typeof s.person.$inferInsert)[] = [];
    const accounts: (typeof s.ledgerAccount.$inferInsert)[] = [];
    const memberships: (typeof s.membership.$inferInsert)[] = [];
    const freezes: (typeof s.membershipFreeze.$inferInsert)[] = [];
    const payments: (typeof s.payment.$inferInsert)[] = [];
    const checkIns: (typeof s.checkIn.$inferInsert)[] = [];
    const snapshots: (typeof s.accessSnapshot.$inferInsert)[] = [];
    const postings: Posting[] = [];

    const usedMobiles = new Set<string>(staffRows.map((x) => x.mobile));

    for (let i = 0; i < memberCount; i += 1) {
      const female = chance(0.42);
      let first: string = female ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
      let last: string = pick(LAST);
      // ~15% arrive spelled with Arabic codepoints, as legacy imports do.
      if (chance(0.15)) {
        first = toArabicSpelling(first);
        last = toArabicSpelling(last);
      }

      let mobile = `9${int(10, 39)}${String(int(0, 9_999_999)).padStart(7, '0')}`;
      while (usedMobiles.has(mobile)) {
        mobile = `9${int(10, 39)}${String(int(0, 9_999_999)).padStart(7, '0')}`;
      }
      usedMobiles.add(mobile);

      const personId = randomUUID();
      // 8% never converted — leads, not members.
      const isLead = chance(0.08);
      const joinedDaysAgo = int(10, 900);

      people.push({
        id: personId,
        orgId,
        homeLocationId: locationId,
        firstName: first,
        lastName: last,
        mobile,
        searchName: normalizePersianText(`${first} ${last}`).toLowerCase(),
        gender: female ? 'female' : 'male',
        birthDate: new Date(Date.UTC(int(1970, 2006), int(0, 11), int(1, 28)))
          .toISOString()
          .slice(0, 10),
        stage: isLead ? 'lead' : 'active',
        memberNo: isLead ? null : 1000 + i,
        source: pick(['walk_in', 'instagram_dm', 'referral', 'import']),
        firstSeenAt: new Date(now.getTime() - joinedDaysAgo * DAY),
        convertedAt: isLead ? null : new Date(now.getTime() - (joinedDaysAgo - 2) * DAY),
      });

      const receivable = { id: randomUUID(), orgId, kind: 'member_receivable', personId };
      const wallet = { id: randomUUID(), orgId, kind: 'member_wallet', personId };
      accounts.push(receivable, wallet);

      if (isLead) continue;

      // ---- membership ------------------------------------------------------
      const plan = pick(plans);
      const startsAt = new Date(now.getTime() - int(0, 45) * DAY);
      const endsAt = addDays(startsAt, plan.durationDays ?? 30);
      const expired = endsAt.getTime() < now.getTime();
      const frozen = !expired && chance(0.06);

      const discountRial = chance(0.18) ? T(int(1, 4) * 100_000) : 0;
      const membershipId = randomUUID();
      const sessionsTotal = plan.sessionCount;
      const sessionsUsed = sessionsTotal ? int(0, sessionsTotal) : 0;

      memberships.push({
        id: membershipId,
        orgId,
        personId,
        planId: plan.id,
        locationId,
        status: frozen ? 'frozen' : expired ? 'expired' : 'active',
        startsAt,
        endsAt,
        sessionsTotal,
        sessionsUsed,
        listPriceRial: plan.priceRial,
        discountRial,
        soldByStaffId: receptionistId,
        jalaliYm: jalaliYm(startsAt),
      });

      if (frozen) {
        freezes.push({
          id: randomUUID(),
          orgId,
          membershipId,
          fromAt: new Date(now.getTime() - int(2, 20) * DAY),
          reason: pick(['سفر', 'مصدومیت', 'بیماری']),
          createdByStaffId: receptionistId,
        });
      }

      // ---- the sale --------------------------------------------------------
      postings.push({
        type: 'membership_sale',
        refId: membershipId,
        occurredAt: startsAt,
        tx: membershipSale({
          receivableId: receivable.id,
          revenueId: revTuition.id,
          discountId: discountAcct.id,
          listPriceRial: plan.priceRial,
          discountRial,
        }),
      });

      // ---- payment behaviour ----------------------------------------------
      // ~30% end up carrying arrears — the number the whole product sells against.
      const net = plan.priceRial - discountRial;
      const roll = rnd();
      let paidRial = net;
      // Round to the nearest 100,000 Rial (10,000 Toman): real part-payments are
      // round numbers, and a fractional-Toman total in the report is a smell.
      if (roll < 0.18) paidRial = Math.round((net * (0.3 + rnd() * 0.4)) / 100_000) * 100_000;
      else if (roll < 0.3) paidRial = 0; // nothing yet

      if (paidRial > 0) {
        const paidAt = new Date(startsAt.getTime() + int(0, 3) * DAY);
        postings.push({
          type: 'payment',
          occurredAt: paidAt,
          tx: recordPayment({
            intoAccountId: drawer.id,
            receivableId: receivable.id,
            amountRial: paidRial,
          }),
        });
        payments.push({
          id: randomUUID(),
          orgId,
          personId,
          method: pick(['cash', 'card_pos', 'card_transfer']),
          amountRial: paidRial,
          receivedAt: paidAt,
          receivedByStaffId: receptionistId,
        });
      }

      // ---- a legacy opening balance for some imported members --------------
      if (chance(0.07)) {
        const openedAt = new Date(now.getTime() - int(30, 120) * DAY);
        postings.push({
          type: 'opening_balance',
          occurredAt: openedAt,
          tx: openingBalance({
            receivableId: receivable.id,
            openingId: openingAcct.id,
            amountRial: T(int(1, 9) * 50_000),
          }),
        });
      }

      // ---- wallet top-up ---------------------------------------------------
      if (chance(0.22)) {
        const topUpAt = new Date(now.getTime() - int(1, 60) * DAY);
        postings.push({
          type: 'wallet_topup',
          occurredAt: topUpAt,
          tx: walletTopUp({
            intoAccountId: drawer.id,
            walletId: wallet.id,
            amountRial: T(int(1, 6) * 100_000),
          }),
        });
      }

      // ---- attendance: each member has their own baseline ------------------
      const baselinePerWeek = int(1, 5);
      const lapsed = chance(0.12);
      const attendanceDays = lapsed ? int(20, 60) : 90;
      for (let d = attendanceDays; d > (lapsed ? 14 : 0); d -= 1) {
        if (!chance(baselinePerWeek / 7)) continue;
        const at = new Date(now.getTime() - d * DAY + int(9, 21) * 3_600_000);
        if (at < startsAt) continue;
        checkIns.push({
          id: randomUUID(),
          orgId,
          personId,
          locationId,
          membershipId,
          method: pick(['qr', 'card', 'manual']),
          occurredAt: at,
          admitted: true,
          sessionConsumed: Boolean(sessionsTotal),
          clientEventId: `seed:${personId}:${d}`,
          jalaliYm: jalaliYm(at),
        });
      }

      // ---- precomputed door decision --------------------------------------
      const sessionsRemaining = sessionsTotal ? sessionsTotal - sessionsUsed : null;
      const canEnter = !expired && !frozen && (sessionsRemaining === null || sessionsRemaining > 0);
      snapshots.push({
        personId,
        locationId,
        orgId,
        canEnter,
        reasonCode: canEnter
          ? 'ok'
          : frozen
            ? 'frozen'
            : expired
              ? 'expired'
              : 'no_sessions',
        membershipId,
        sessionsRemaining,
        arrearsRial: Math.max(0, net - paidRial),
        validUntil: new Date(now.getTime() + 15 * 60_000),
        rev: i + 1,
      });
    }

    // ---- lockers and buffet -------------------------------------------------
    const lockers = Array.from({ length: 60 }, (_, i) => ({
      id: randomUUID(),
      orgId,
      locationId,
      code: `${i < 40 ? 'A' : 'V'}-${String((i % 40) + 1).padStart(2, '0')}`,
      kind: i < 40 ? 'public' : 'vip',
      status: 'free',
    }));
    const products = PRODUCTS.map((p) => ({
      id: randomUUID(),
      orgId,
      locationId,
      name: p.name,
      priceRial: p.priceRial,
      tracksStock: true,
      isActive: true,
    }));

    // ---- write everything ---------------------------------------------------
    console.log(
      `Inserting ${people.length} people, ${memberships.length} memberships, ` +
        `${checkIns.length} check-ins, ${postings.length} ledger transactions…`,
    );

    const CHUNK = 500;
    const chunked = async <R>(rows: R[], fn: (batch: R[]) => Promise<unknown>): Promise<void> => {
      for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
    };

    await db.transaction(async (tx) => {
      await chunked(people, (b) => tx.insert(s.person).values(b));
      await chunked(accounts, (b) => tx.insert(s.ledgerAccount).values(b));
      await chunked(memberships, (b) => tx.insert(s.membership).values(b));
      if (freezes.length) await chunked(freezes, (b) => tx.insert(s.membershipFreeze).values(b));

      // Ledger: transactions then entries, all inside this one DB transaction.
      // The balance trigger is DEFERRABLE INITIALLY DEFERRED and checks at COMMIT.
      const txRows: (typeof s.ledgerTransaction.$inferInsert)[] = [];
      const entryRows: (typeof s.ledgerEntry.$inferInsert)[] = [];
      for (const p of postings) {
        assertBalanced(p.tx); // fail loudly in JS before the DB has to
        const id = randomUUID();
        txRows.push({
          id,
          orgId,
          type: p.type,
          refTable: p.refId ? 'membership' : null,
          refId: p.refId ?? null,
          occurredAt: p.occurredAt,
          jalaliYm: jalaliYm(p.occurredAt),
          createdByStaffId: receptionistId,
        });
        for (const e of p.tx.entries) {
          entryRows.push({
            id: randomUUID(),
            orgId,
            transactionId: id,
            accountId: e.accountId,
            direction: e.direction,
            amountRial: e.amountRial,
          });
        }
      }
      await chunked(txRows, (b) => tx.insert(s.ledgerTransaction).values(b));
      await chunked(entryRows, (b) => tx.insert(s.ledgerEntry).values(b));

      if (payments.length) await chunked(payments, (b) => tx.insert(s.payment).values(b));
      await chunked(checkIns, (b) => tx.insert(s.checkIn).values(b));
      await chunked(snapshots, (b) => tx.insert(s.accessSnapshot).values(b));
      await tx.insert(s.locker).values(lockers);
      await tx.insert(s.product).values(products);
    });

    // ---- report -------------------------------------------------------------
    const arrearsRows = await db.execute(sql`
      SELECT COALESCE(SUM(arrears_rial), 0)::text AS total, COUNT(*)::text AS members
        FROM v_member_arrears WHERE org_id = ${orgId}
    `);
    const arrears = arrearsRows[0] as { total: string; members: string } | undefined;
    const totalRial = Number(arrears?.total ?? 0);

    // The invariant, asserted against the database rather than assumed.
    const balanceRows = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_rial ELSE -amount_rial END), 0)::text AS imbalance
        FROM ledger_entry WHERE org_id = ${orgId}
    `);
    const imbalance = Number((balanceRows[0] as { imbalance: string }).imbalance);
    if (imbalance !== 0) throw new Error(`seeded ledger is unbalanced by ${imbalance} rial`);

    console.log('');
    console.log(`Seeded «${config.SEED_ORG_NAME}»`);
    console.log(`  people           ${people.length}  (${memberships.length} members)`);
    console.log(`  check-ins        ${checkIns.length}`);
    console.log(`  ledger txns      ${postings.length}`);
    console.log(`  members in debt  ${arrears?.members ?? 0}`);
    console.log(`  total arrears    ${formatTomanLatin(totalRial)} Toman`);
    console.log(`  ledger balance   ${imbalance === 0 ? 'balanced ✓' : 'UNBALANCED'}`);
    console.log('');
    console.log(`  login: 09123333333 / ${DEV_PASSWORD}  (receptionist)`);
    console.log(`         09121111111 / ${DEV_PASSWORD}  (owner)`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
