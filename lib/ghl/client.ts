// GHL API v2 client — Private Integration Token auth.
//
// Supports multiple GHL sub-accounts in parallel. Each request optionally
// names a sub-account via `RequestOpts.subAccountId`; callers that don't
// specify get the default account (kept stable for backward compatibility).
// Sub-account → PIT/locationId mapping lives in `./subAccounts`.

import {
  DEFAULT_SUB_ACCOUNT_ID,
  getSubAccountEnv,
  getConfiguredSubAccountIds,
  type GhlSubAccountId,
} from "./subAccounts";

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
  subAccountId: GhlSubAccountId;
  constructor(subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID) {
    const envHint =
      subAccountId === "agency"
        ? "GHL_PIT_AGENCY and GHL_LOCATION_ID_AGENCY"
        : "GHL_PIT and GHL_LOCATION_ID";
    super(
      `GHL sub-account "${subAccountId}" is not configured. Set ${envHint} in .env.local.`
    );
    this.name = "GhlNotConfiguredError";
    this.subAccountId = subAccountId;
  }
}

export function getGhlConfig(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): { pit: string; locationId: string; subAccountId: GhlSubAccountId } {
  const env = getSubAccountEnv(subAccountId);
  if (!env) throw new GhlNotConfiguredError(subAccountId);
  return { ...env, subAccountId };
}

/** True when the named sub-account has its env vars set, or — when called
 *  without args — when ANY sub-account is configured. The latter shape is
 *  what API routes use to gate "is GHL available at all?" branches. */
export function isGhlConfigured(subAccountId?: GhlSubAccountId): boolean {
  if (subAccountId) return getSubAccountEnv(subAccountId) !== null;
  return getConfiguredSubAccountIds().length > 0;
}

// ── Rate limiter ─────────────────────────────────────────────────────
//
// Token bucket gating every outbound GHL call. GHL PIT documents 100 burst
// per 10s; observed throughput suggests slightly higher in practice but the
// previous fan-out happily exceeded that and got 429-stormed. 20/s with a
// 20-token burst stays comfortably within the documented budget while still
// letting per-page enrichment chew through ~300 calls in ~15s.
//
// Note: the limiter is global, shared across all sub-accounts. GHL's docs
// rate-limit per PIT, so two sub-accounts could in theory drain 100/s each,
// but our 50/s cap leaves headroom and keeps the implementation simple. If
// fan-out from one account starves the other, split into per-PIT limiters.

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
  /** Which sub-account's PIT to send. Defaults to DEFAULT_SUB_ACCOUNT_ID. */
  subAccountId?: GhlSubAccountId;
}

const MAX_429_RETRIES = 4;

export async function ghlRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const subAccountId = opts.subAccountId ?? DEFAULT_SUB_ACCOUNT_ID;
  const { pit } = getGhlConfig(subAccountId);
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
