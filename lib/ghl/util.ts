import cache from "@/lib/cache";

// Field-name tolerance helpers.
//
// GHL has shipped the same domain field under multiple names across API
// versions and even across siblings within v2 — `contactId` vs `contact_id`
// vs nested `contact.id`, `dateAdded` vs `date_added` vs `createdAt`, etc.
// These helpers try each candidate path in order and return the first hit.

export function getNested(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  if (!path.includes(".")) return (obj as Record<string, unknown>)[path];
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function pickStr(obj: unknown, ...paths: string[]): string | null {
  for (const p of paths) {
    const v = getNested(obj, p);
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export function pickNum(obj: unknown, ...paths: string[]): number | null {
  for (const p of paths) {
    const v = getNested(obj, p);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

export function pickBool(obj: unknown, ...paths: string[]): boolean | null {
  for (const p of paths) {
    const v = getNested(obj, p);
    if (typeof v === "boolean") return v;
  }
  return null;
}

export function pickStringArray(obj: unknown, ...paths: string[]): string[] {
  for (const p of paths) {
    const v = getNested(obj, p);
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
  }
  return [];
}

/**
 * Pick a date/time field, accepting either an ISO-8601 string or a Unix
 * milliseconds number. GHL has been observed returning each, sometimes within
 * the same endpoint family (e.g. /calendars/events). Normalizes to ISO so
 * downstream `Date.parse(...)` calls always work.
 */
export function pickIso(obj: unknown, ...paths: string[]): string | null {
  for (const p of paths) {
    const v = getNested(obj, p);
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) {
      // Heuristic: a Unix timestamp this century is in the [10^12, 10^13)
      // range as ms, [10^9, 10^10) as seconds. Treat <10^11 as seconds.
      const ms = v < 1e11 ? v * 1000 : v;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

// ── Cached single-flight ─────────────────────────────────────────────
//
// In-flight promise dedup so two concurrent callers asking for the same
// expensive GHL fetch (same cache key) end up sharing one promise instead
// of triggering two full fan-outs. Combined with the existing TTL cache,
// this gives us the "stampede-resistant cache" pattern.

const inflight = new Map<string, Promise<unknown>>();

/**
 * Return the cached value if present; otherwise run `loader()` exactly once
 * for this key (any concurrent callers await the same promise) and cache
 * the result for `ttlSeconds`. Doesn't pollute the cache on loader errors.
 */
export async function cachedSingleflight<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) return cached;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    // Re-check the cache: another waiter may have populated it between our
    // initial check and this point.
    const recached = cache.get<T>(key);
    if (recached !== null) return recached;
    const result = await loader();
    cache.set(key, result, ttlSeconds);
    return result;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

