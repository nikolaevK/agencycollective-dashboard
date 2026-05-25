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
