/**
 * In-process single-flight + short replay window keyed by an idempotency key
 * — pure (no I/O), so it's unit-tested. Used by publish-draft so a double
 * click, a client retry after a dropped response, or two tabs sending the
 * same attempt join ONE Meta write instead of creating two ads.
 *
 * Per server instance only: the cross-instance guard is the persisted attempt
 * row (lib/adCopyDraftAttempts.ts + decideAttempt in lib/adCopy/draft.ts) —
 * this just joins concurrent same-key requests on one instance. Failures
 * aren't kept: a retry with the same key runs again, and the attempt row
 * decides whether it resumes, replays or must ask first.
 */

interface Entry<T> {
  promise: Promise<T>;
  settledAt: number | null;
}

export interface IdempotencyStore<T> {
  run(key: string, fn: () => Promise<T>): Promise<{ value: T; replayed: boolean }>;
  size(): number;
}

export function createIdempotencyStore<T>(opts: {
  ttlMs: number;
  maxEntries: number;
  /** Keep a settled result for replay? (e.g. only successes) */
  keep: (value: T) => boolean;
  now?: () => number;
}): IdempotencyStore<T> {
  const map = new Map<string, Entry<T>>();
  const now = opts.now ?? Date.now;

  function prune() {
    const t = now();
    map.forEach((e, k) => {
      if (e.settledAt !== null && t - e.settledAt > opts.ttlMs) map.delete(k);
    });
    if (map.size <= opts.maxEntries) return;
    // Oldest settled first (Map iterates in insertion order); in-flight entries stay.
    const keys = Array.from(map.keys());
    for (const k of keys) {
      if (map.size <= opts.maxEntries) break;
      if (map.get(k)?.settledAt !== null) map.delete(k);
    }
  }

  return {
    async run(key, fn) {
      prune();
      const existing = map.get(key);
      if (existing) return { value: await existing.promise, replayed: true };

      const entry: Entry<T> = { promise: Promise.resolve(undefined as T), settledAt: null };
      entry.promise = (async () => {
        try {
          const value = await fn();
          if (opts.keep(value)) entry.settledAt = now();
          else map.delete(key);
          return value;
        } catch (err) {
          map.delete(key);
          throw err;
        }
      })();
      map.set(key, entry);
      return { value: await entry.promise, replayed: false };
    },
    size: () => map.size,
  };
}
