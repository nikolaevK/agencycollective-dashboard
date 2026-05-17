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

// GHL PIT documents 100 burst per 10s. Token bucket lets a fresh request
// burst through 20 calls then refills at 15/s — slightly above the
// strict 10/s sustained rate to give each call a tiny bit of headroom,
// but well under the per-tenant 100/10s ceiling even when multiple
// Vercel instances run concurrently. The earlier 50/50 setting was 5×
// over budget and caused 429-storms in production; the previous 10/20
// dial-down was too conservative and let the retry path bloat function
// runtime past Vercel's 30s ceiling.
const limiter = new RateLimiter(20, 15);

// ── Request ──────────────────────────────────────────────────────────

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  /** Override the GHL Version header. Some endpoints require 2023-02-21. */
  version?: string;
  /**
   * Hard ceiling on total time for this call (including retries). Default
   * 10s. Critical because fetchWithConcurrency awaits all settled — one
   * stuck call can otherwise block the entire bulk fetch and burn the
   * function's 30s Vercel budget.
   */
  timeoutMs?: number;
}

// 3 retries × 5s max each = ~15s worst-case per call, which fits inside
// the 10s per-call timeout below in the happy path and lets the timeout
// abort cleanly otherwise. Larger retry budgets (we tried 6 × 15s) made
// single calls stall for 90s, blocking the whole calendar fan-out and
// timing out the function.
const MAX_429_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

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

  // Single overall deadline covering rate-limit wait + retries + fetch.
  // AbortSignal.timeout is widely supported in Node 18+ / modern fetch.
  const deadlineMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + deadlineMs;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error(`GHL ${method} ${path} timed out after ${deadlineMs}ms`)), deadlineMs);

  try {
    let attempt = 0;
    while (true) {
      await limiter.acquire();
      if (abort.signal.aborted) throw abort.signal.reason ?? new Error("aborted");

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
        signal: abort.signal,
      });

      // Transparent 429 retry — GHL bursts can over-run our limiter when
      // concurrent callers all happen to grab tokens at once. Read the
      // Retry-After header (seconds) if present, otherwise back off
      // exponentially. Full jitter prevents multiple serverless instances
      // from synchronizing their retries and re-amplifying the burst.
      // Skip the retry if the wait would push us past our deadline —
      // better to throw a 429 we can recover from than block.
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        attempt += 1;
        const retryAfter = res.headers.get("Retry-After");
        const ra = retryAfter ? Number(retryAfter) : NaN;
        const ceiling = Number.isFinite(ra) && ra > 0
          ? Math.min(5_000, ra * 1000)
          : Math.min(5_000, 500 * Math.pow(2, attempt));
        const waitMs = Math.floor(ceiling * (0.5 + Math.random() * 0.5));
        if (Date.now() + waitMs >= deadline) {
          // Don't wait — let the next iteration's signal check throw.
          throw new GhlApiError(429, null, `GHL ${method} ${path} 429 after ${attempt} attempts; would exceed timeout`);
        }
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
  } finally {
    clearTimeout(timer);
  }
}
