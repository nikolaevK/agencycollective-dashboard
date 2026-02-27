import { z } from "zod";

const API_BASE = "https://graph.facebook.com";

function getApiVersion(): string {
  return process.env.META_API_VERSION || "v21.0";
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
}

/**
 * Core Meta API fetch function with:
 * - Auth injection
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
  const { params = {}, retries = 3 } = options;
  const version = getApiVersion();
  const token = getAccessToken();

  const url = new URL(`${API_BASE}/${version}${path}`);
  url.searchParams.set("access_token", token);

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) {
      url.searchParams.set(key, String(val));
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { "Content-Type": "application/json" },
        // Next.js cache: no-store for fresh data from API routes
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
        throw new MetaApiError(
          `HTTP ${response.status}`,
          response.status
        );
      }

      // Validate with Zod
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        console.error("Zod validation error:", parsed.error.flatten());
        throw new MetaApiError(
          `API response validation failed: ${parsed.error.message}`,
          0
        );
      }

      return parsed.data;
    } catch (err) {
      // Don't retry on these errors
      if (
        err instanceof RateLimitError ||
        err instanceof TokenExpiredError
      ) {
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
 * Execute a Meta Batch API call (up to 50 requests per call).
 * POST to https://graph.facebook.com/{version} with form-encoded body.
 */
export async function metaBatchFetch(
  requests: BatchRequest[]
): Promise<BatchResponseItem[]> {
  const version = getApiVersion();
  const token = getAccessToken();

  const url = `${API_BASE}/${version}`;
  const body = new URLSearchParams({
    access_token: token,
    batch: JSON.stringify(requests),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
