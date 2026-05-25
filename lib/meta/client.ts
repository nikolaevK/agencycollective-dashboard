import { z } from "zod";
import { createHash } from "crypto";
import {
  readMetaCache,
  writeMetaCache,
  extendMetaCacheExpiry,
  META_CACHE_DEFAULT_TTL_SECONDS,
  META_CACHE_ERROR_COOLDOWN_SECONDS,
} from "./persistentCache";

const API_BASE = "https://graph.facebook.com";

/**
 * In-process single-flight: collapse concurrent identical Meta requests into a
 * single network call so a cold/expired cache can't trigger a stampede of
 * simultaneous Meta hits for the same data.
 */
const inflight = new Map<string, Promise<unknown>>();
function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

function getApiVersion(): string {
  return process.env.META_API_VERSION || "v25.0";
}

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new TokenExpiredError("META_ACCESS_TOKEN is not configured");
  return token;
}

// Custom error types
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  readonly code = 429;

  constructor(retryAfterSeconds = 60) {
    super(`Meta API rate limit exceeded. Retry after ${retryAfterSeconds}s`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TokenExpiredError extends Error {
  readonly code = 401;

  constructor(message = "Meta access token expired or invalid") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

export class MetaApiError extends Error {
  readonly metaCode: number;
  readonly metaSubcode?: number;

  constructor(message: string, code: number, subcode?: number) {
    super(message);
    this.name = "MetaApiError";
    this.metaCode = code;
    this.metaSubcode = subcode;
  }
}

interface FetchOptions {
  params?: Record<string, string | number | boolean | undefined>;
  retries?: number;
  /**
   * Persistent-cache controls. By default every GET is cached for
   * META_CACHE_DEFAULT_TTL_SECONDS (24h). Pass `skip: true` for the rare call
   * that must always be live, or `ttlSeconds` to override the window.
   */
  cache?: { ttlSeconds?: number; skip?: boolean };
}

/**
 * Core Meta API GET with:
 * - Auth injection
 * - A persistent 24h response cache so a given query hits Meta at most once per
 *   day, shared across all serverless instances and users (admin + portal).
 *   This is the key defense against the frequent-polling pattern that can get ad
 *   accounts banned — see lib/meta/persistentCache.ts.
 * - In-process single-flight (no stampede when the cache is cold/expired)
 * - Serve-stale-on-error (a Meta outage / rate-limit returns last-known data
 *   instead of hammering the API or blanking the UI)
 * - Rate limit detection (code 80000)
 * - Token expiry detection (code 190)
 * - Exponential backoff for 5xx
 * - Zod schema validation
 */
export async function metaFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options: FetchOptions = {}
): Promise<T> {
  const { params = {}, retries = 3, cache: cacheOpts } = options;
  const version = getApiVersion();
  const token = getAccessToken();

  const url = new URL(`${API_BASE}/${version}${path}`);

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) {
      url.searchParams.set(key, String(val));
    }
  }

  const skipCache = cacheOpts?.skip === true;
  const ttlSeconds = cacheOpts?.ttlSeconds ?? META_CACHE_DEFAULT_TTL_SECONDS;
  const cacheKey = `GET ${url.toString()}`;

  // 1) Serve a fresh cached response without touching Meta at all. If a cached
  //    payload no longer matches the schema (e.g. a deploy tightened it mid-TTL,
  //    or the row is corrupt), fall through and refetch once to rebuild it
  //    rather than erroring every request for the rest of the 24h window.
  if (!skipCache) {
    const cached = await readMetaCache(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const parsed = schema.safeParse(cached.body);
      if (parsed.success) return parsed.data;
      console.warn(
        `[meta-cache] cached payload for ${path} failed schema validation; refetching once to rebuild`
      );
    }
  }

  // 2) Otherwise fetch from Meta (deduping concurrent identical requests).
  //    Write through on success; serve stale on failure.
  const body = await dedupe(cacheKey, async () => {
    try {
      const fresh = await fetchMetaJson(url.toString(), token, retries);
      if (!skipCache) await writeMetaCache(cacheKey, fresh, ttlSeconds);
      return fresh;
    } catch (err) {
      if (!skipCache) {
        const stale = await readMetaCache(cacheKey);
        if (stale) {
          console.warn(
            `[meta-cache] Meta fetch failed for ${path}; serving stale data from ${new Date(
              stale.fetchedAt
            ).toISOString()}:`,
            err instanceof Error ? err.message : err
          );
          // Cool down so a sustained failure doesn't re-hit Meta on every read.
          await extendMetaCacheExpiry(cacheKey, META_CACHE_ERROR_COOLDOWN_SECONDS);
          return stale.body;
        }
      }
      throw err;
    }
  });

  return parseMetaBody(schema, body);
}

/** Validate a (fresh or cached) Meta response body against its Zod schema. */
function parseMetaBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("Zod validation error:", parsed.error.flatten());
    throw new MetaApiError(
      `API response validation failed: ${parsed.error.message}`,
      0
    );
  }
  return parsed.data;
}

/**
 * Raw network GET to the Meta Graph API. Returns the parsed JSON body on
 * success; throws RateLimitError / TokenExpiredError / MetaApiError on Meta
 * errors. Retries network errors and 5xx with exponential backoff. Schema
 * validation happens in the caller (parseMetaBody) so a schema mismatch is not
 * retried.
 */
async function fetchMetaJson(
  urlString: string,
  token: string,
  retries: number
): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(urlString, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        // Next.js cache: no-store — our persistent cache is the source of truth
        cache: "no-store",
      });

      const body = await response.json();

      // Check for Meta error structure
      if (body.error) {
        const { code, message, error_subcode } = body.error;

        // Rate limit
        if (code === 80000 || code === 17 || code === 4) {
          throw new RateLimitError(60);
        }

        // Token invalid/expired
        if (code === 190 || code === 102 || code === 10) {
          throw new TokenExpiredError(message);
        }

        throw new MetaApiError(message, code, error_subcode);
      }

      if (!response.ok) {
        // Retry on 5xx
        if (response.status >= 500 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          continue;
        }
        throw new MetaApiError(`HTTP ${response.status}`, response.status);
      }

      return body;
    } catch (err) {
      // Don't retry on these errors
      if (err instanceof RateLimitError || err instanceof TokenExpiredError) {
        throw err;
      }

      // Retry on network errors and 5xx
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw new MetaApiError("Max retries exceeded", 0);
}

/**
 * Meta API POST function for mutations (create ads, upload images, etc.).
 * Uses application/x-www-form-urlencoded body (Meta Graph API standard for mutations).
 * Same auth, error handling, and retry logic as metaFetch().
 */
export async function metaFetchPost<T>(
  path: string,
  schema: z.ZodType<T>,
  body: Record<string, string>,
  options: { retries?: number } = {}
): Promise<T> {
  const { retries = 3 } = options;
  const version = getApiVersion();
  const token = getAccessToken();

  const url = `${API_BASE}/${version}${path}`;
  const formBody = new URLSearchParams(body);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${token}`,
        },
        body: formBody.toString(),
        cache: "no-store",
      });

      const parsed = await response.json();
      console.log(`[metaFetchPost] ${path} response:`, JSON.stringify(parsed).slice(0, 500));

      if (parsed.error) {
        const { code, message, error_subcode } = parsed.error;
        console.error(`[metaFetchPost] ${path} error:`, parsed.error);
        if (code === 80000 || code === 17 || code === 4) {
          throw new RateLimitError(60);
        }
        if (code === 190 || code === 102 || code === 10) {
          throw new TokenExpiredError(message);
        }
        throw new MetaApiError(message, code, error_subcode);
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          continue;
        }
        throw new MetaApiError(`HTTP ${response.status}`, response.status);
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        console.error("Zod validation error (POST):", validated.error.flatten());
        throw new MetaApiError(
          `API response validation failed: ${validated.error.message}`,
          0
        );
      }

      return validated.data;
    } catch (err) {
      // Don't retry on auth, rate limit, or API-level errors (e.g. code 3 capability)
      if (
        err instanceof RateLimitError ||
        err instanceof TokenExpiredError ||
        err instanceof MetaApiError
      ) {
        throw err;
      }
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new MetaApiError("Max retries exceeded", 0);
}

/**
 * Meta API POST with multipart/form-data body (for file uploads like adimages).
 * Same auth and error handling as metaFetchPost().
 */
export async function metaFetchMultipart<T>(
  path: string,
  schema: z.ZodType<T>,
  formData: FormData,
  options: { retries?: number } = {}
): Promise<T> {
  const { retries = 3 } = options;
  const version = getApiVersion();
  const token = getAccessToken();

  const url = `${API_BASE}/${version}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          // Do NOT set Content-Type — fetch sets it with the boundary for multipart
        },
        body: formData,
        cache: "no-store",
      });

      const parsed = await response.json();
      console.log(`[metaFetchMultipart] ${path} response:`, JSON.stringify(parsed).slice(0, 500));

      if (parsed.error) {
        const { code, message, error_subcode } = parsed.error;
        console.error(`[metaFetchMultipart] ${path} error:`, parsed.error);
        if (code === 80000 || code === 17 || code === 4) {
          throw new RateLimitError(60);
        }
        if (code === 190 || code === 102 || code === 10) {
          throw new TokenExpiredError(message);
        }
        throw new MetaApiError(message, code, error_subcode);
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          continue;
        }
        throw new MetaApiError(`HTTP ${response.status}`, response.status);
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        console.error("Zod validation error (multipart):", validated.error.flatten());
        throw new MetaApiError(
          `API response validation failed: ${validated.error.message}`,
          0
        );
      }

      return validated.data;
    } catch (err) {
      if (
        err instanceof RateLimitError ||
        err instanceof TokenExpiredError ||
        err instanceof MetaApiError
      ) {
        throw err;
      }
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new MetaApiError("Max retries exceeded", 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BatchRequest {
  method: "GET";
  relative_url: string;
}

export interface BatchResponseItem {
  code: number;
  body: string;
}

/**
 * Execute a Meta Batch API call (up to 50 requests per call), cached like
 * metaFetch: a fresh batch result is served from the persistent cache; on a
 * miss we POST once (deduped) and write through. A batch whose top-level call
 * succeeds but contains failed sub-requests is cached only briefly so the failed
 * accounts self-heal on the next read instead of being missing for 24h.
 * POST to https://graph.facebook.com/{version} with form-encoded body.
 */
export async function metaBatchFetch(
  requests: BatchRequest[],
  options: { cache?: { ttlSeconds?: number; skip?: boolean } } = {}
): Promise<BatchResponseItem[]> {
  const version = getApiVersion();
  const token = getAccessToken();

  const skipCache = options.cache?.skip === true;
  const ttlSeconds = options.cache?.ttlSeconds ?? META_CACHE_DEFAULT_TTL_SECONDS;
  const cacheKey = `BATCH ${version} ${createHash("sha256")
    .update(JSON.stringify(requests))
    .digest("hex")}`;

  // 1) Serve a fresh cached batch result.
  if (!skipCache) {
    const cached = await readMetaCache(cacheKey);
    if (cached && cached.expiresAt > Date.now() && Array.isArray(cached.body)) {
      return cached.body as BatchResponseItem[];
    }
  }

  // 2) Otherwise POST to Meta (deduped). Write through on success; serve stale
  //    on failure.
  return dedupe(cacheKey, async () => {
    try {
      const result = await runMetaBatch(requests, version, token);
      if (!skipCache) {
        // If any sub-request failed, cache only for the short cooldown so those
        // accounts retry soon — but still not on every single read.
        const allOk = result.every((it) => it && it.code === 200);
        await writeMetaCache(
          cacheKey,
          result,
          allOk ? ttlSeconds : META_CACHE_ERROR_COOLDOWN_SECONDS
        );
      }
      return result;
    } catch (err) {
      if (!skipCache) {
        const stale = await readMetaCache(cacheKey);
        if (stale && Array.isArray(stale.body)) {
          console.warn(
            `[meta-cache] Meta batch failed; serving stale batch from ${new Date(
              stale.fetchedAt
            ).toISOString()}:`,
            err instanceof Error ? err.message : err
          );
          await extendMetaCacheExpiry(cacheKey, META_CACHE_ERROR_COOLDOWN_SECONDS);
          return stale.body as BatchResponseItem[];
        }
      }
      throw err;
    }
  });
}

/** Raw network POST for a Meta Batch API call. Throws on top-level errors. */
async function runMetaBatch(
  requests: BatchRequest[],
  version: string,
  token: string
): Promise<BatchResponseItem[]> {
  const url = `${API_BASE}/${version}`;
  const body = new URLSearchParams({
    batch: JSON.stringify(requests),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${token}`,
    },
    body: body.toString(),
    cache: "no-store",
  });

  const parsed = await response.json();

  // Top-level error (e.g. rate limit or auth)
  if (parsed && !Array.isArray(parsed) && parsed.error) {
    const { code, message, error_subcode } = parsed.error;
    if (code === 80000 || code === 17 || code === 4) {
      throw new RateLimitError(60);
    }
    if (code === 190 || code === 102 || code === 10) {
      throw new TokenExpiredError(message);
    }
    throw new MetaApiError(message, code, error_subcode);
  }

  if (!Array.isArray(parsed)) {
    throw new MetaApiError("Unexpected batch response format", 0);
  }

  return parsed as BatchResponseItem[];
}
