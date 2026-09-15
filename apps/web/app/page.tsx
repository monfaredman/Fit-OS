'use client';

/**
 * The Desk — design/receptionist-flow.md §2.
 *
 * One screen, always open. The search box holds focus and any keystroke goes to
 * it, because a QR scanner is just a keyboard: scanning fills the box and
 * submits, with no scanner-specific mode to get stuck in.
 *
 * The member card shows the same four facts in the same four positions every
 * time — subscription, expiry, debt, locker. Staff learn the positions and stop
 * reading the labels within a week, so the order never changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemberCardDto, SearchResultDto } from '@gymos/contracts';
import { api, ApiError, getToken, setToken } from '@/lib/api';
import { faNum, jalali, mobileFa, parseAmountToman, toman, tomanBare } from '@/lib/format';

type Banner = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

export default function Desk() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [staff, setStaff] = useState<{ firstName: string; lastName: string; role: string } | null>(
    null,
  );

  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResultDto[]>([]);
  const [card, setCard] = useState<MemberCardDto | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) return setAuthed(false);
    api
      .me()
      .then((m) => {
        setStaff(m);
        setAuthed(true);
      })
      .catch(() => setAuthed(false));
  }, []);

  // The search box owns the keyboard. Esc clears everything back to a clean desk.
  useEffect(() => {
    if (!authed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQ('');
        setResults([]);
        setCard(null);
        setBanner(null);
        setPayOpen(false);
        searchRef.current?.focus();
        return;
      }
      const el = document.activeElement;
      const typingElsewhere = el instanceof HTMLInputElement && el !== searchRef.current;
      if (!typingElsewhere && e.key.length === 1) searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authed]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      api.search(q.trim()).then(setResults).catch(() => setResults([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  const open = useCallback(async (id: string) => {
    setBusy(true);
    try {
      setCard(await api.card(id));
      setResults([]);
      setBanner(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const doCheckIn = async (override = false) => {
    if (!card) return;
    setBusy(true);
    try {
      const r = await api.checkIn(card.person.id, override);
      const name = `${r.firstName} ${r.lastName}`;
      if (r.admitted && card.arrearsRial > 0) {
        setBanner({ kind: 'warn', text: `${name} وارد شد — بدهی ${toman(card.arrearsRial)}` });
      } else if (r.admitted) {
        const left =
          r.sessionsRemaining === null ? '' : ` · ${faNum(r.sessionsRemaining)} جلسه باقی`;
        setBanner({ kind: 'ok', text: `${name} — خوش آمدید${left}` });
      } else {
        setBanner({ kind: 'error', text: `${name} — ${REASON_FA[r.reasonCode] ?? r.reasonCode}` });
      }
      setCard(await api.card(card.person.id));
    } catch (e) {
      setBanner({ kind: 'error', text: e instanceof ApiError ? e.message : 'خطا' });
    } finally {
      setBusy(false);
    }
  };

  const doPay = async (raw: string) => {
    if (!card) return;
    const rial = parseAmountToman(raw);
    if (rial === null || rial <= 0) {
      setBanner({ kind: 'error', text: 'مبلغ معتبر نیست.' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.pay(card.person.id, rial);
      setBanner({
        kind: 'ok',
        text: `${toman(rial)} دریافت شد — مانده بدهی ${toman(r.arrearsRial)}`,
      });
      setPayOpen(false);
      setCard(await api.card(card.person.id));
    } catch (e) {
      setBanner({ kind: 'error', text: e instanceof ApiError ? e.message : 'خطا' });
    } finally {
      setBusy(false);
    }
  };

  if (authed === null) return <Centre>در حال بارگذاری…</Centre>;
  if (!authed) return <Login onDone={() => location.reload()} />;

  return (
    <main className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-5 flex items-center justify-between border-b border-line pb-3">
        <div className="text-sm text-muted">
          پذیرش · {staff?.firstName} {staff?.lastName}
        </div>
        <button
          className="text-sm text-muted hover:text-ink"
          onClick={() => {
            setToken(null);
            location.reload();
          }}
        >
          خروج
        </button>
      </header>

      <input
        ref={searchRef}
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جستجو: نام، موبایل، شماره عضویت…"
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-lg outline-none"
      />

      {banner && (
        <div
          role="status"
          className={`mt-4 rounded-lg px-4 py-3 text-lg ${
            banner.kind === 'ok'
              ? 'bg-ok/10 text-ok'
              : banner.kind === 'warn'
                ? 'bg-warn/10 text-warn'
                : 'bg-danger/10 text-danger'
          }`}
        >
          {banner.text}
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => open(r.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-ground"
              >
                <span>
                  {r.firstName} {r.lastName}
                  <span className="ms-3 text-sm text-muted ltr-num">{mobileFa(r.mobile)}</span>
                </span>
                {r.arrearsRial > 0 && (
                  <span className="text-sm text-danger ltr-num">{tomanBare(r.arrearsRial)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {card && (
        <section className="mt-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">
              {card.person.firstName} {card.person.lastName}
            </h2>
            <span className={card.access.canEnter ? 'text-ok' : 'text-danger'}>
              {card.access.canEnter ? '● فعال' : `✕ ${REASON_FA[card.access.reasonCode] ?? ''}`}
            </span>
          </div>
          <div className="mt-1 text-sm text-muted">
            <span className="ltr-num">{mobileFa(card.person.mobile)}</span>
            {card.person.memberNo !== null && <> · عضو {faNum(card.person.memberNo)}</>}
          </div>

          {/* The four facts. Same order, every time. Never hidden when empty. */}
          <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-2 text-lg">
            <Fact label="اشتراک">
              {card.membership
                ? `${card.membership.planName}${
                    card.membership.sessionsRemaining !== null
                      ? ` — ${faNum(card.membership.sessionsRemaining)} جلسه باقی`
                      : ''
                  }`
                : '—'}
            </Fact>
            <Fact label="انقضا">
              {card.membership?.endsAt ? (
                <>
                  <span className="ltr-num">{jalali(card.membership.endsAt)}</span>
                  {card.membership.daysRemaining !== null && (
                    <span className="ms-2 text-sm text-muted">
                      {faNum(card.membership.daysRemaining)} روز
                    </span>
                  )}
                </>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label="بدهی">
              {card.arrearsRial > 0 ? (
                <span className="text-danger">
                  <span className="ltr-num">{tomanBare(card.arrearsRial)}</span> تومان
                  {card.arrearsAgeDays !== null && (
                    <span className="ms-2 text-sm text-muted">
                      {faNum(card.arrearsAgeDays)} روز
                    </span>
                  )}
                </span>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label="کمد">{card.locker ? card.locker.code : '—'}</Fact>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => doCheckIn(false)}
              className="rounded-lg bg-accent px-5 py-2.5 text-white disabled:opacity-50"
            >
              ثبت ورود
            </button>
            <button
              disabled={busy}
              onClick={() => setPayOpen((v) => !v)}
              className="rounded-lg border border-line px-5 py-2.5 disabled:opacity-50"
            >
              دریافت وجه
            </button>
            {!card.access.canEnter && (
              <button
                disabled={busy}
                onClick={() => doCheckIn(true)}
                className="rounded-lg border border-danger px-5 py-2.5 text-danger disabled:opacity-50"
              >
                ورود دستی
              </button>
            )}
          </div>

          {payOpen && <PayBox onPay={doPay} busy={busy} />}
        </section>
      )}
    </main>
  );
}

const REASON_FA: Record<string, string> = {
  ok: 'مجاز',
  expired: 'اشتراک منقضی شده',
  arrears: 'بدهی معوق',
  no_sessions: 'جلسات تمام شده',
  frozen: 'اشتراک در تعلیق',
  wrong_gender_block: 'ساعت مخصوص جنسیت دیگر',
  no_membership: 'اشتراک فعال ندارد',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Partial payment is a first-class path, never an error state. */
function PayBox({ onPay, busy }: { onPay: (v: string) => void; busy: boolean }) {
  const [v, setV] = useState('');
  return (
    <form
      className="mt-4 flex gap-2 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onPay(v);
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="numeric"
        placeholder="مبلغ به تومان (ارقام فارسی یا لاتین)"
        className="flex-1 rounded-lg border border-line px-4 py-2.5 ltr-num text-right outline-none"
      />
      <button
        disabled={busy}
        className="rounded-lg bg-accent px-5 py-2.5 text-white disabled:opacity-50"
      >
        ثبت
      </button>
    </form>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Centre>
      <form
        className="w-80 rounded-lg border border-line bg-surface p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const s = await api.login(mobile, password);
            setToken(s.token);
            onDone();
          } catch (e2) {
            setErr(e2 instanceof ApiError ? e2.message : 'خطا');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="mb-4 text-xl">ورود پذیرش</h1>
        <input
          autoFocus
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="موبایل"
          className="mb-2 w-full rounded-lg border border-line px-3 py-2 ltr-num text-right outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="رمز عبور"
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 outline-none"
        />
        {err && <p className="mb-3 text-sm text-danger">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-accent py-2.5 text-white disabled:opacity-50"
        >
          ورود
        </button>
      </form>
    </Centre>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center">{children}</div>;
}
