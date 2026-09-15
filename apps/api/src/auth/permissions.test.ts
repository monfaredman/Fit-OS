import { describe, expect, it } from 'vitest';
import { can, capabilitiesFor, discountCapPct, writeoffCapRial } from './permissions.js';

describe('the fraud controls from design/permissions.md §2', () => {
  it('never lets a receptionist write off arrears', () => {
    // The attack: record the payment, void the debt, pocket the cash.
    expect(can('receptionist', 'arrears.writeoff')).toBe(false);
    expect(writeoffCapRial('receptionist', 5_000_000)).toBe(0);
  });

  it('caps a receptionist discount at the org setting, owners unrestricted', () => {
    expect(discountCapPct('receptionist', 20)).toBe(20);
    expect(discountCapPct('manager', 20)).toBe(100);
    expect(discountCapPct('owner', 20)).toBe(100);
  });

  it('gives a trainer no discount authority at all', () => {
    expect(discountCapPct('trainer', 20)).toBe(0);
    expect(writeoffCapRial('trainer', 5_000_000)).toBe(0);
  });

  it('bounds a manager write-off by the org cap', () => {
    expect(writeoffCapRial('manager', 5_000_000)).toBe(5_000_000);
  });
});

describe('the receptionist is operationally powerful, financially weak', () => {
  it('can run the whole front desk', () => {
    for (const c of [
      'checkin.create',
      'checkin.override',
      'person.create',
      'membership.sell',
      'membership.freeze',
      'payment.take',
      'locker.assign',
      'drawer.close',
    ] as const) {
      expect(can('receptionist', c), c).toBe(true);
    }
  });

  it('cannot reach org money, staff or exports', () => {
    for (const c of [
      'revenue.view.org',
      'ledger.adjust',
      'arrears.writeoff',
      'staff.manage',
      'export.full',
      'person.export',
      'automation.manage',
      'sms.bulk',
    ] as const) {
      expect(can('receptionist', c), c).toBe(false);
    }
  });
});

describe('role boundaries', () => {
  it('reserves billing and full export to the owner alone', () => {
    for (const role of ['manager', 'receptionist', 'trainer', 'accountant'] as const) {
      expect(can(role, 'billing.manage'), role).toBe(false);
      expect(can(role, 'export.full'), role).toBe(false);
    }
    expect(can('owner', 'billing.manage')).toBe(true);
  });

  it('lets a trainer see risk and check members in, nothing more', () => {
    expect(can('trainer', 'risk.view')).toBe(true);
    expect(can('trainer', 'checkin.create')).toBe(true);
    expect(can('trainer', 'payment.take')).toBe(false);
    expect(can('trainer', 'membership.sell')).toBe(false);
  });

  it('gives the accountant money access without operational access', () => {
    expect(can('accountant', 'ledger.adjust')).toBe(true);
    expect(can('accountant', 'revenue.view.org')).toBe(true);
    expect(can('accountant', 'checkin.create')).toBe(false);
    expect(can('accountant', 'membership.sell')).toBe(false);
  });

  it('gives the owner every capability', () => {
    const owner = capabilitiesFor('owner');
    const all = capabilitiesFor('owner').length;
    expect(owner).toHaveLength(all);
    expect(can('owner', 'ledger.adjust')).toBe(true);
    expect(can('owner', 'audit.view')).toBe(true);
  });
});
