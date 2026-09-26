/**
 * Snapshot pull and outbox flush — design/offline-sync.md §3 and §5.
 *
 * Nothing here is on the scan path. A member is admitted from the IndexedDB
 * cache with no network call at all; this module only keeps that cache fresh
 * and drains the outbox when a connection happens to exist.
 */

import {
  drop,
  getMeta,
  pending,
  putSnapshots,
  removeSnapshots,
  setMeta,
  type OutboxEvent,
  type SnapshotRow,
} from './outbox';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

const REV_KEY = 'snapshot:rev';
const OFFSET_KEY = 'clock:offsetMs';

export interface SyncState {
  online: boolean;
  queued: number;
  lastSyncAt: string | null;
  cached: number;
  clockOffsetMs: number;
}

interface SnapshotPage {
  rev: number;
  full: boolean;
  upserts: SnapshotRow[];
  deletes: string[];
  serverTime: string;
}

/**
 * A paired kiosk presents a DEVICE credential, not a staff token. It reaches
 * exactly the two sync endpoints — it cannot take a payment, which is the
 * whole point of pairing an unattended machine in a public room.
 */
function authHeaders(deviceSecret: string): HeadersInit {
  return { 'content-type': 'application/json', authorization: `Device ${deviceSecret}` };
}

/**
 * Pull deltas by monotonic `rev`.
 *
 * Not by timestamp: the kiosk's clock is untrustworthy and the server's can
 * move. A counter cannot. An unknown or too-old `rev` comes back as
 * `full: true` and the cache is replaced wholesale rather than left subtly
 * incomplete.
 */
export async function pullSnapshot(token: string, locationId: string): Promise<number> {
  const since = (await getMeta<number>(REV_KEY)) ?? null;
  const url = new URL(`${BASE}/v1/sync/snapshot`);
  url.searchParams.set('locationId', locationId);
  if (since !== null) url.searchParams.set('since', String(since));

  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const page = (await res.json()) as SnapshotPage;

  await putSnapshots(page.upserts, page.full);
  await removeSnapshots(page.deletes);
  await setMeta(REV_KEY, page.rev);

  // Measure our own clock offset so a wrong PC clock is at least visible.
  await setMeta(OFFSET_KEY, Date.now() - new Date(page.serverTime).getTime());

  return page.upserts.length;
}

/**
 * Drain the outbox.
 *
 * Accepted and duplicate are BOTH success — the event is deleted either way.
 * That is what makes re-flushing safe, and it is why the outbox can be drained
 * repeatedly without consuming a second session.
 *
 * Rejections are rare and real (a person removed between caching and flushing).
 * They are dropped rather than retried forever, and surfaced to staff.
 */
export async function flushOutbox(
  token: string,
  locationId: string,
): Promise<{ sent: number; rejected: { clientEventId: string; code: string }[] }> {
  const queued = await pending();
  if (!queued.length) return { sent: 0, rejected: [] };

  // Oldest first, in batches, so a long outage drains in order.
  const batch = queued
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .slice(0, 200)
    .map((e: OutboxEvent) => ({
      clientEventId: e.clientEventId,
      personId: e.personId,
      occurredAt: e.occurredAt,
      method: e.method,
      admitted: e.admitted,
      denialReason: e.denialReason,
    }));

  const res = await fetch(`${BASE}/v1/sync/check-ins`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ locationId, events: batch }),
  });
  if (!res.ok) throw new Error(`flush ${res.status}`);

  const out = (await res.json()) as {
    accepted: string[];
    duplicates: string[];
    rejected: { clientEventId: string; code: string }[];
  };

  await drop([...out.accepted, ...out.duplicates, ...out.rejected.map((r) => r.clientEventId)]);
  return { sent: out.accepted.length, rejected: out.rejected };
}

/**
 * The background loop. Pull every 60s while online; flush on reconnect and then
 * every 30s while anything is queued, with backoff on failure.
 *
 * Deliberately never throws into the UI: a sync failure must not interrupt a
 * receptionist mid-scan.
 */
export function startSync(
  token: string,
  locationId: string,
  onState: (s: Partial<SyncState>) => void,
): () => void {
  let stopped = false;
  let backoffMs = 1_000;

  const tick = async () => {
    if (stopped) return;
    try {
      if (navigator.onLine) {
        await pullSnapshot(token, locationId);
        const { sent, rejected } = await flushOutbox(token, locationId);
        if (rejected.length) console.warn('sync rejected', rejected);
        backoffMs = 1_000;
        onState({
          online: true,
          lastSyncAt: new Date().toISOString(),
          queued: (await pending()).length,
          clockOffsetMs: (await getMeta<number>(OFFSET_KEY)) ?? 0,
        });
        void sent;
      } else {
        onState({ online: false, queued: (await pending()).length });
      }
    } catch {
      // Offline or the server is unhappy. Neither is the kiosk's problem: it
      // keeps admitting members from cache.
      onState({ online: false, queued: (await pending()).length });
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
    if (!stopped) setTimeout(tick, navigator.onLine ? 60_000 : backoffMs);
  };

  void tick();
  const onOnline = () => void tick();
  window.addEventListener('online', onOnline);

  return () => {
    stopped = true;
    window.removeEventListener('online', onOnline);
  };
}
