/**
 * Shared React Query timing for Meta (Facebook) ad-data hooks.
 *
 * Meta data is refreshed at most once per 24h on the server (see
 * `lib/meta/persistentCache.ts`) to avoid the frequent-polling pattern that can
 * trigger Meta automation bans. The client hooks mirror that cadence so the
 * browser doesn't issue needless refetches. These client requests only ever hit
 * our own cached API routes — never Meta directly — so this is about a clean,
 * consistent "data updates once a day" UX rather than ban-safety itself (the
 * server cache is what actually shields Meta).
 */
export const META_QUERY_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ApiFetchError extends Error {
  status?: number;
  retryAfter?: number;
}

/**
 * Shared fetch → status-enriched error → `{data}` envelope unwrap for the
 * Meta data hooks. Previously each hook hand-rolled this block and only
 * useAccounts enriched 429s with Retry-After — so rate-limit backoff UX
 * silently worked for one query out of five.
 */
export async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const err = new Error("Rate limit exceeded") as ApiFetchError;
    err.status = 429;
    if (retryAfter) err.retryAfter = parseInt(retryAfter, 10);
    throw err;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const fallback = res.status === 401 ? "Token expired or invalid" : `HTTP ${res.status}`;
    const err = new Error(body.error || fallback) as ApiFetchError;
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as { data: T };
  return json.data;
}
