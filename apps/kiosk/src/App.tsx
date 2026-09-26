/**
 * The kiosk — design/offline-sync.md §4.
 *
 * Deliberately NOT a Next.js route (design/tech-stack.md §3). This boots from
 * cache with zero network, holds the whole access snapshot in IndexedDB, and
 * admits a member in under two seconds with the cable unplugged. Next.js is
 * server-first; building that inside it means fighting the framework at every
 * step. It also means a bad web deploy cannot break the door.
 *
 * The scan path touches no network. It reads a precomputed boolean, shows a
 * banner, and appends to the outbox. That is the whole design.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  consumeSessionLocally,
  enqueue,
  getSnapshot,
  makeClientEventId,
  allSnapshots,
  type SnapshotRow,
} from './lib/outbox';
import { startSync, type SyncState } from './lib/sync';

const REASON_FA: Record<string, string> = {
  ok: 'خوش آمدید',
  expired: 'اشتراک منقضی شده',
  arrears: 'بدهی معوق',
  no_sessions: 'جلسات تمام شده',
  frozen: 'اشتراک در تعلیق',
  wrong_gender_block: 'ساعت مخصوص جنسیت دیگر',
  no_membership: 'اشتراک فعال ندارد',
};

const fa = (n: number | string) =>
  String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
const toman = (rial: number) => fa((rial / 10).toLocaleString('en-US'));

type Result = { row: SnapshotRow; admitted: boolean; reason: string } | null;

export default function App() {
  const [state, setState] = useState<SyncState>({
    online: navigator.onLine,
    queued: 0,
    lastSyncAt: null,
    cached: 0,
    clockOffsetMs: 0,
  });
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<number>(0);

  // A device secret, obtained once by redeeming a pairing code — never a
  // staff token (TASK-013).
  const token = localStorage.getItem('gymos:deviceSecret') ?? '';
  const locationId = localStorage.getItem('gymos:locationId') ?? '';
  const deviceId = localStorage.getItem('gymos:deviceId') ?? 'kiosk1';

  useEffect(() => {
    if (!token || !locationId) return;
    const stop = startSync(token, locationId, (s) => setState((p) => ({ ...p, ...s })));
    void allSnapshots().then((r) => setState((p) => ({ ...p, cached: r.length })));
    return stop;
  }, [token, locationId]);

  // The input owns the keyboard: a QR scanner is just a keyboard, so there is
  // no scanner-specific mode to get stuck in.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    const t = setInterval(focus, 1_000);
    return () => clearInterval(t);
  }, []);

  /**
   * The scan path. No await on the network, ever — the decision is already in
   * IndexedDB. If this needed a server call, the offline story would be a lie.
   */
  const scan = useCallback(
    async (raw: string) => {
      const needle = raw.trim();
      if (!needle) return;
      setQuery('');

      const all = await allSnapshots();
      const digits = needle.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
      const row =
        (await getSnapshot(needle)) ??
        all.find((r) => r.mobileLast4 === digits.slice(-4)) ??
        all.find((r) => String(r.memberNo ?? '') === digits);

      if (!row) {
        setResult(null);
        flash();
        return;
      }

      const admitted = row.canEnter;
      setResult({ row, admitted, reason: REASON_FA[row.reasonCode ?? 'ok'] ?? '' });

      await enqueue({
        clientEventId: makeClientEventId(deviceId),
        personId: row.personId,
        occurredAt: new Date().toISOString(),
        method: 'qr',
        admitted,
        denialReason: admitted ? null : row.reasonCode,
        snapshotRev: row.rev,
      });
      if (admitted) await consumeSessionLocally(row.personId);
      setState((p) => ({ ...p, queued: p.queued + 1 }));
      flash();
    },
    [deviceId],
  );

  const flash = () => {
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setResult(null), 4_000);
  };

  if (!token || !locationId) {
    return (
      <Shell>
        <p className="text-xl">
          این دستگاه هنوز جفت نشده است.
          <br />
          <span className="text-base opacity-70">
            از پذیرش کد شش‌رقمی بگیرید و وارد کنید.
          </span>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Connection state is permanently visible, never hidden. Staff must be
          able to tell at a glance, and «آفلاین» is not an error here. */}
      <div className="absolute top-4 left-4 text-sm">
        {state.online ? (
          <span className="text-emerald-400">● آنلاین</span>
        ) : (
          <span className="text-amber-400">
            ◐ آفلاین{state.queued > 0 && <> — {fa(state.queued)} ورود در صف</>}
          </span>
        )}
        <span className="ms-4 opacity-50">{fa(state.cached)} عضو در حافظه</span>
      </div>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void scan(query);
        }}
        placeholder="کارت را بکشید یا کد را اسکن کنید"
        className="w-[28rem] rounded-xl border-2 border-white/20 bg-white/5 px-6 py-5
                   text-center text-2xl outline-none placeholder:opacity-40"
      />

      {result && (
        <div
          className={`mt-10 w-[34rem] rounded-2xl p-8 text-center ${
            result.admitted ? 'bg-emerald-500/15' : 'bg-red-500/15'
          }`}
        >
          <div className="text-4xl">
            {result.row.firstName} {result.row.lastName}
          </div>
          <div
            className={`mt-3 text-2xl ${result.admitted ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {result.admitted ? '✓ ' : '✕ '}
            {result.reason}
          </div>
          {result.admitted && result.row.sessionsRemaining !== null && (
            <div className="mt-2 text-xl opacity-70">
              {fa(result.row.sessionsRemaining)} جلسه باقی‌مانده
            </div>
          )}
          {result.admitted && result.row.arrearsRial > 0 && (
            <div className="mt-2 text-xl text-amber-300">
              بدهی {toman(result.row.arrearsRial)} تومان
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen flex-col items-center justify-center
                 bg-[#0f1614] text-white"
    >
      {children}
    </main>
  );
}
