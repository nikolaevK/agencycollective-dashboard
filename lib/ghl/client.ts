// GHL API v2 client — Private Integration Token auth.
//
// Single sub-account. Token + locationId both come from env. Anything that
// requires a refresh dance (OAuth marketplace app, multi-location) is out of
// scope for v1 and would replace this module wholesale.

const BASE_URL = "https://services.leadconnectorhq.com";

// Default Version. Resource modules can override per call — opportunities,
// workflows and conversations need `2023-02-21` while contacts is happy on
// the older one. Sending the wrong Version returns 404/422, not a clear
// error message, so this matters.
const DEFAULT_VERSION = "2021-07-28";

export class GhlApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Reduce an arbitrary error to a single safe log line. Avoids dumping the
 * raw `GhlApiError.body` (which can echo PII from GHL) or full stack traces
 * to the request log.
 */
export function describeError(err: unknown): string {
  if (err instanceof GhlApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export class GhlNotConfiguredError extends Error {
  constructor() {
    super("GHL is not configured. Set GHL_PIT and GHL_LOCATION_ID in .env.local.");
    this.name = "GhlNotConfiguredError";
  }
}

export function getGhlConfig(): { pit: string; locationId: string } {
  const pit = process.env.GHL_PIT;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!pit || !locationId) throw new GhlNotConfiguredError();
  return { pit, locationId };
}

export function isGhlConfigured(): boolean {
  return Boolean(process.env.GHL_PIT && process.env.GHL_LOCATION_ID);
}

// ── Rate limiter ─────────────────────────────────────────────────────
//
// Token bucket gating every outbound GHL call. GHL PIT documents 100 burst
// per 10s; observed throughput suggests slightly higher in practice but the
// previous fan-out happily exceeded that and got 429-stormed. 20/s with a
// 20-token burst stays comfortably within the documented budget while still
// letting per-page enrichment chew through ~300 calls in ~15s.

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private waiters: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.drain();
    });
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.lastRefill = now;
    }
  }

  private drain() {
    this.refill();
    while (this.tokens >= 1 && this.waiters.length > 0) {
      this.tokens -= 1;
      const next = this.waiters.shift()!;
      next();
    }
    if (this.waiters.length > 0 && !this.timer) {
      const need = 1 - this.tokens;
      const waitMs = Math.max(50, Math.ceil((need / this.refillPerSec) * 1000));
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, waitMs);
    }
  }
}

// 50/s sustained — comfortably within GHL PIT's documented daily-cap math
// while letting bulk paginated fetches (calendars, opportunities,
// conversations) drain quickly. 429 retry below covers the rare burst that
// still slips through.
const limiter = new RateLimiter(50, 50);

// ── Request ──────────────────────────────────────────────────────────

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  /** Override the GHL Version header. Some endpoints require 2023-02-21. */
  version?: string;
}

const MAX_429_RETRIES = 4;

export async function ghlRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { pit } = getGhlConfig();
  const method = opts.method ?? "GET";
  const version = opts.version ?? DEFAULT_VERSION;

  const url = new URL(BASE_URL + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  let attempt = 0;
  while (true) {
    await limiter.acquire();

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: version,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });

    // Transparent 429 retry — GHL bursts can over-run our limiter when
    // concurrent callers all happen to grab tokens at once. Read the
    // Retry-After header (seconds) if present, otherwise back off
    // exponentially.
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      attempt += 1;
      const retryAfter = res.headers.get("Retry-After");
      const ra = retryAfter ? Number(retryAfter) : NaN;
      const waitMs = Number.isFinite(ra) && ra > 0
        ? Math.min(15_000, ra * 1000)
        : Math.min(8_000, 500 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    let payload: unknown = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }

    if (!res.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload && typeof (payload as Record<string, unknown>).message === "string"
          ? String((payload as Record<string, unknown>).message)
          : `GHL ${method} ${path} failed (${res.status})`;
      throw new GhlApiError(res.status, payload, message);
    }

    return payload as T;
  }
}
