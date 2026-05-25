/**
 * Persistent (Turso-backed) cache for raw Meta Graph API responses.
 *
 * Why this exists: the in-memory cache (`lib/cache.ts`) is per-process and is
 * wiped on every serverless cold start and never shared across concurrent
 * Vercel instances — so in production it does NOT bound how often we call Meta.
 * Frequent automated polling is exactly the pattern Meta flags and can ban ad
 * accounts for. This layer persists each raw Meta response in the database so a
 * given query hits the Meta Graph API at most once per TTL window (default 24h),
 * shared across every instance and every user (admin dashboard AND client
 * portal both funnel through `metaFetch`/`metaBatchFetch`).
 *
 * Design rules:
 * - The cache must NEVER break data fetching. Every DB call here is wrapped so a
 *   missing table or transient DB error degrades to "cache miss" (we fetch from
 *   Meta) rather than throwing.
 * - Only successful GET/batch responses are stored. Errors are never cached.
 * - Keyed by the canonical request (URL incl. account + date range + fields, or
 *   a hash of the batch payload) — see `lib/meta/client.ts`.
 */

import { getDb } from "@/lib/db";

/** Default time a Meta response is served from cache before we re-fetch (24h). */
export const META_CACHE_DEFAULT_TTL_SECONDS = (() => {
  const v = Number(process.env.META_PERSISTENT_CACHE_TTL_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : 24 * 60 * 60; // 24 hours
})();

/**
 * After a failed Meta fetch we serve the last-known payload and treat it as
 * "fresh" for this long, so a sustained Meta outage / rate-limit can't make us
 * hammer the API on every subsequent read.
 */
export const META_CACHE_ERROR_COOLDOWN_SECONDS = 10 * 60; // 10 minutes

export interface MetaCacheHit {
  /** Parsed JSON body of the original Meta response. */
  body: unknown;
  /** Epoch ms the underlying Meta call was made (the true age of the data). */
  fetchedAt: number;
  /** Epoch ms after which this entry is considered stale. */
  expiresAt: number;
}

/**
 * Read a cached Meta response. Returns null on miss, parse failure, or any DB
 * error (callers treat null as "go fetch from Meta").
 */
export async function readMetaCache(key: string): Promise<MetaCacheHit | null> {
  try {
    const db = getDb();
    const res = await db.execute({
      sql: "SELECT payload, fetched_at, expires_at FROM meta_cache WHERE cache_key = ? LIMIT 1",
      args: [key],
    });
    const row = res.rows[0];
    if (!row) return null;

    let body: unknown;
    try {
      body = JSON.parse(String(row.payload));
    } catch {
      return null; // corrupt payload — treat as miss
    }

    return {
      body,
      fetchedAt: Number(row.fetched_at),
      expiresAt: Number(row.expires_at),
    };
  } catch (err) {
    console.warn(
      "[meta-cache] read failed (degrading to miss):",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Write (upsert) a Meta response. Best-effort: a failure here just means the
 * next request re-fetches from Meta. Never throws.
 */
export async function writeMetaCache(
  key: string,
  body: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    const db = getDb();
    const now = Date.now();
    await db.execute({
      sql: `INSERT OR REPLACE INTO meta_cache (cache_key, payload, fetched_at, expires_at)
            VALUES (?, ?, ?, ?)`,
      args: [key, JSON.stringify(body), now, now + ttlSeconds * 1000],
    });

    // Opportunistic cleanup of long-dead keys (e.g. one-off custom date ranges
    // that will never be requested again). Cheap and bounds table growth.
    if (Math.random() < 0.02) {
      await db
        .execute({
          sql: "DELETE FROM meta_cache WHERE expires_at < ?",
          args: [now - 7 * 24 * 60 * 60 * 1000],
        })
        .catch(() => {});
    }
  } catch (err) {
    console.warn(
      "[meta-cache] write failed (skipping cache):",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Extend an existing entry's freshness window without touching its payload or
 * fetched_at. Used as a post-error cooldown so we serve stale data for a short
 * while instead of re-hitting a failing Meta API on every read. Never throws.
 */
export async function extendMetaCacheExpiry(
  key: string,
  seconds: number
): Promise<void> {
  try {
    const db = getDb();
    await db.execute({
      sql: "UPDATE meta_cache SET expires_at = ? WHERE cache_key = ?",
      args: [Date.now() + seconds * 1000, key],
    });
  } catch {
    /* best-effort cooldown — safe to ignore */
  }
}
