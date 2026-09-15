# gymos-core

Domain core: money, Jalali, ledger. **Framework-free on purpose** — this is the
part where a silent bug is unrecoverable, so it has no dependency on Nuxt,
Drizzle or a database and can be tested in milliseconds.

```bash
npm install
npm test
npm run typecheck
```

| Module | Responsibility |
|---|---|
| `src/money.ts` | Rial ↔ Toman, Persian/Latin digit input, mobile + name normalisation |
| `src/jalali.ts` | Solar Hijri conversion, Tehran timezone, Saturday weeks, expiry arithmetic |
| `src/ledger.ts` | Double-entry invariant, transaction builders, Zarinpal fee |

## Why these three first

`../design/tech-stack.md` §5 lists six things worth testing in a solo-maintained
system. These modules are the first three, and they are the three that cannot be
retrofitted:

- **A money bug reaches a member's phone.** A Rial figure shown as Toman reads as a 10× overcharge.
- **A Jalali bug makes every revenue report quietly wrong** at month boundaries, and nobody notices for a quarter.
- **A ledger bug makes arrears disagree with payments** — the exact failure that makes the incumbent software untrustworthy, and the one thing GymOS cannot afford to reproduce.

## Load-bearing invariants

1. **Rial is the only stored unit.** Toman is display. All scaling is string-based; no floats touch money.
2. **Balances are never stored.** Arrears is the balance of a `member_receivable` account. Corrections are reversing entries, never edits.
3. **Every Jalali conversion goes through Tehran local time.** A check-in at 01:00 Tehran belongs to a different Jalali day than the same instant in UTC.
4. **The week starts Saturday.** `weekdayIndex` returns 0 for شنبه.

This module duplicates the database's balance constraint
(`../design/0001_guards.sql` §2) deliberately. The database is the authority;
this exists so the bug fails in a unit test instead of at a gym.

## Not here yet

Persistence, HTTP, auth, UI. Those arrive with the Nuxt app once the gym visits
answer the open question in `../design/domain-model.md` §8 — member identity is
the only one that can still change the schema.
