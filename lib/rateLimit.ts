/**
 * In-memory token bucket — a soft per-process rate limit, not a hard global
 * one. On Vercel each lambda has its own bucket, so the effective ceiling is
 * `limit × concurrent_lambdas`. Good enough as a spam guard against a single
 * abusive client; for a hard global ceiling you'd want Vercel KV / Upstash
 * Ratelimit. The Map auto-trims on read, so memory stays bounded.
 */

import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000; // hard cap to bound memory; LRU-ish trim if exceeded

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the bucket resets — only meaningful when !ok. */
  retryAfter: number;
}

/**
 * Returns ok=false when the caller has spent its allowance for the current
 * window. The caller is expected to short-circuit with a 429 response.
 *
 * @param key      stable identity (e.g. `chat:client:<userId>`); different
 *                 keys are independent buckets
 * @param limit    max events per window
 * @param windowMs sliding window length in ms
 */
export function checkRate(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    // Fresh window — opportunistic GC if the map has grown unbounded. Drops
    // the first 10% of entries; iteration order is insertion order so this
    // is roughly oldest-first. Cheap, no heap needed.
    if (buckets.size >= MAX_BUCKETS) {
      const drop = Math.ceil(MAX_BUCKETS * 0.1);
      let i = 0;
      for (const k of buckets.keys()) {
        if (i++ >= drop) break;
        buckets.delete(k);
      }
    }
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.windowStart + windowMs - now) / 1000),
    };
  }

  bucket.count++;
  return { ok: true, retryAfter: 0 };
}

/**
 * Sugar for the very common "if rate-limited, return 429" pattern in route
 * handlers. Returns a NextResponse on bust, or null when the caller should
 * proceed. Saves repeating the same 5-line block at the top of every handler.
 */
export function rateLimitedResponse(
  key: string,
  limit: number,
  windowMs: number = 60_000,
  message: string = "Too many requests. Please slow down."
): NextResponse | null {
  const rate = checkRate(key, limit, windowMs);
  if (rate.ok) return null;
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
  );
}
