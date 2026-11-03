// Generated / continued-from images, kept in IndexedDB so a reload (or coming
// back to Creative Studio) still shows the thread. sessionStorage can't hold
// them (~5 MB quota vs multi-MB 4K renders). Best effort: if IndexedDB is
// unavailable every call resolves quietly and images live only in memory
// (putImage reports it so the UI can say so).
//
// Records are { id, blob, savedAt }. The thread in sessionStorage references
// them by id; pruneImages() drops records no open thread uses once they're old.

const DB_NAME = "ac-image-generator";
/** sessionStorage key of the thread metadata (hooks/useImageGeneratorSession). */
export const IMAGE_GEN_SESSION_KEY = "ac-image-gen";
const STORE = "images";
const DB_VERSION = 1;
/** pruneImages' count cap never takes a record this fresh — it may be another tab's. */
const PRUNE_GRACE_MS = 60 * 60 * 1000;

interface ImageRecord {
  id: string;
  blob: Blob;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab is deleting the database (sign-out): let it through.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Resolves true when the transaction committed. */
function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

/** false = not stored (no IndexedDB, quota, private mode) — the image lives in memory only. */
export async function putImage(id: string, blob: Blob): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, blob, savedAt: Date.now() } satisfies ImageRecord);
    return await done(tx);
  } catch {
    return false;
  }
}

export async function getImages(ids: readonly string[]): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  const db = await openDb();
  if (!db || ids.length === 0) return out;
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as ImageRecord | undefined;
        if (record?.blob) out.set(id, record.blob);
      };
    }
    await done(tx);
  } catch {
    /* treat as missing */
  }
  return out;
}

export async function deleteImages(ids: readonly string[]): Promise<void> {
  const db = await openDb();
  if (!db || ids.length === 0) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    await done(tx);
  } catch {
    /* ignore */
  }
}

/**
 * Which records not in `keep` to drop: those older than `maxAgeMs`, then the
 * oldest beyond `maxRecords` — but never one saved within PRUNE_GRACE_MS.
 * Other tabs' threads aren't visible here, so a fresh unkept record may be
 * one of theirs; a tab left open for days still loses its oldest images.
 */
export function prunableImageIds(
  unkept: readonly { id: string; savedAt: number }[],
  keptCount: number,
  now: number,
  maxAgeMs: number,
  maxRecords: number
): string[] {
  const cutoff = now - maxAgeMs;
  const graceCutoff = now - PRUNE_GRACE_MS;
  let excess = unkept.length + keptCount - maxRecords;
  const drop: string[] = [];
  for (const r of [...unkept].sort((a, b) => a.savedAt - b.savedAt)) {
    if (r.savedAt < cutoff || (excess > 0 && r.savedAt < graceCutoff)) {
      drop.push(r.id);
      excess--;
    }
  }
  return drop;
}

export async function pruneImages(keep: ReadonlySet<string>, maxAgeMs: number, maxRecords: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const unkept: { id: string; savedAt: number }[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        for (const id of prunableImageIds(unkept, keep.size, Date.now(), maxAgeMs, maxRecords)) store.delete(id);
        return;
      }
      const record = cursor.value as ImageRecord;
      if (!keep.has(record.id)) unkept.push({ id: record.id, savedAt: record.savedAt });
      cursor.continue();
    };
    await done(tx);
  } catch {
    /* ignore */
  }
}

/**
 * Forget every stored thread + image in this browser (call on sign-out, so a
 * shared computer doesn't keep the last admin's generations).
 */
export async function clearStoredImages(): Promise<void> {
  try {
    sessionStorage.removeItem(IMAGE_GEN_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
  // An open connection would block the delete until the page unloads.
  const db = dbPromise ? await dbPromise : null;
  db?.close();
  dbPromise = null;
  if (typeof indexedDB === "undefined") return;
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    /* ignore */
  }
}
