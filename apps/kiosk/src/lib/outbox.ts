/**
 * The offline outbox — design/offline-sync.md §4.
 *
 * Two properties make this simple enough to trust:
 *
 *   - the admission decision is already computed and cached, so the scan path
 *     touches no network at all
 *   - a check-in is an append-only fact, so replaying one is a duplicate to
 *     suppress, never a conflict to merge
 *
 * There is deliberately no merge logic in this file, because there is nothing
 * to merge.
 *
 * Storage is IndexedDB, so the outbox survives a reboot. It has NO size cap: a
 * gym offline for a day must not lose its day.
 */

const DB_NAME = 'gymos-kiosk';
const DB_VERSION = 1;
const SNAPSHOTS = 'snapshots';
const OUTBOX = 'outbox';
const META = 'meta';

export interface SnapshotRow {
  personId: string;
  firstName: string;
  lastName: string;
  mobileLast4: string;
  memberNo: number | null;
  canEnter: boolean;
  reasonCode: string | null;
  membershipId: string | null;
  sessionsRemaining: number | null;
  arrearsRial: number;
  validUntil: string;
  rev: number;
}

export interface OutboxEvent {
  clientEventId: string;
  personId: string;
  occurredAt: string;
  method: string;
  admitted: boolean;
  denialReason: string | null;
  snapshotRev: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        db.createObjectStore(SNAPSHOTS, { keyPath: 'personId' });
      }
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: 'clientEventId' });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ------------------------------- snapshots ------------------------------- */

export async function putSnapshots(rows: SnapshotRow[], replaceAll = false): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(SNAPSHOTS, 'readwrite');
    const store = t.objectStore(SNAPSHOTS);
    if (replaceAll) store.clear();
    for (const r of rows) store.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function removeSnapshots(personIds: string[]): Promise<void> {
  if (!personIds.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(SNAPSHOTS, 'readwrite');
    for (const id of personIds) t.objectStore(SNAPSHOTS).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export const allSnapshots = (): Promise<SnapshotRow[]> =>
  tx<SnapshotRow[]>(SNAPSHOTS, 'readonly', (s) => s.getAll());

export const getSnapshot = (personId: string): Promise<SnapshotRow | undefined> =>
  tx<SnapshotRow | undefined>(SNAPSHOTS, 'readonly', (s) => s.get(personId));

/** Optimistic local decrement so a double scan shows the right number. */
export async function consumeSessionLocally(personId: string): Promise<void> {
  const row = await getSnapshot(personId);
  if (!row || row.sessionsRemaining === null) return;
  const next = Math.max(0, row.sessionsRemaining - 1);
  await putSnapshots([
    { ...row, sessionsRemaining: next, canEnter: next > 0 ? row.canEnter : false },
  ]);
}

/* --------------------------------- outbox -------------------------------- */

export const enqueue = (e: OutboxEvent): Promise<IDBValidKey> =>
  tx<IDBValidKey>(OUTBOX, 'readwrite', (s) => s.put(e));

export const pending = (): Promise<OutboxEvent[]> =>
  tx<OutboxEvent[]>(OUTBOX, 'readonly', (s) => s.getAll());

export async function drop(clientEventIds: string[]): Promise<void> {
  if (!clientEventIds.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(OUTBOX, 'readwrite');
    for (const id of clientEventIds) t.objectStore(OUTBOX).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ---------------------------------- meta --------------------------------- */

export const getMeta = <T>(key: string): Promise<T | undefined> =>
  tx<T | undefined>(META, 'readonly', (s) => s.get(key));

export const setMeta = (key: string, value: unknown): Promise<IDBValidKey> =>
  tx<IDBValidKey>(META, 'readwrite', (s) => s.put(value, key));

/**
 * `{deviceId}:{unixSeconds}:{random}` — generated locally, never by the server,
 * and stable across retries. This is what makes a replay a no-op rather than a
 * second session consumed.
 */
export function makeClientEventId(deviceId: string): string {
  return `${deviceId}:${Math.floor(Date.now() / 1000)}:${Math.random().toString(36).slice(2, 8)}`;
}
