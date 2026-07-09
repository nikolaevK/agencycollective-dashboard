import { NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * Shared response envelope for the external API (`/api/v1/*`) ONLY — existing
 * cookie-authed routes keep their own shapes. Success mirrors types/api.ts
 * `ApiResponse<T>` (`{ data, meta }`); errors extend `ApiError` with a stable
 * machine-readable string `code`.
 */

export type ApiErrorCode =
  | "missing_token"
  | "invalid_token"
  | "rate_limited"
  | "insufficient_scope"
  | "resource_forbidden"
  | "invalid_request"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "internal_error";

const ALLOWED_ORIGINS = (process.env.API_ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(): Record<string, string> {
  // Token-authenticated API (no cookies), so a permissive default is safe;
  // restrict via API_ALLOWED_ORIGINS when needed. ACAO must be a SINGLE
  // origin (or *) — echo the request's Origin when it's in the list, else
  // fall back to the first entry (the browser then correctly blocks).
  let allowOrigin = "*";
  if (!ALLOWED_ORIGINS.includes("*")) {
    let requestOrigin: string | null = null;
    try {
      requestOrigin = headers().get("origin");
    } catch {
      // outside a request scope — fall through to the first entry
    }
    allowOrigin =
      requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
        ? requestOrigin
        : ALLOWED_ORIGINS[0];
  }
  const out: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (allowOrigin !== "*") out["Vary"] = "Origin";
  return out;
}

export function ok<T>(
  data: T,
  meta?: Record<string, unknown>,
  init?: { status?: number }
): NextResponse {
  return NextResponse.json(
    { data, meta: { cached: false, timestamp: Date.now(), ...meta } },
    { status: init?.status ?? 200, headers: corsHeaders() }
  );
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export function okList<T>(items: T[], pagination: Pagination): NextResponse {
  return ok(items, {
    pagination: {
      ...pagination,
      hasMore: pagination.offset + items.length < pagination.total,
    },
  });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  extra?: { retryAfter?: number; data?: unknown }
): NextResponse {
  const headers: Record<string, string> = corsHeaders();
  if (extra?.retryAfter != null) {
    headers["Retry-After"] = String(extra.retryAfter);
  }
  const body: Record<string, unknown> = { error: message, code };
  if (extra?.retryAfter != null) body.retryAfter = extra.retryAfter;
  if (extra?.data !== undefined) body.data = extra.data;
  return NextResponse.json(body, { status, headers });
}

/** Standard OPTIONS handler for every v1 route. */
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** Attach CORS headers to a hand-built response (e.g. BLOB streams). */
export function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** `?limit&offset` with defaults + clamping (limit 1..200, offset >= 0). */
export function parsePagination(url: URL): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get("limit"));
  const rawOffset = Number(url.searchParams.get("offset"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0
    ? Math.floor(rawOffset)
    : 0;
  return { limit, offset };
}

/** Slice a fully-filtered array into a page (filter BEFORE calling this). */
export function paginate<T>(
  items: T[],
  page: { limit: number; offset: number }
): { items: T[]; pagination: Pagination } {
  return {
    items: items.slice(page.offset, page.offset + page.limit),
    pagination: { total: items.length, limit: page.limit, offset: page.offset },
  };
}

/** Parse a JSON body, returning null on malformed input (caller 400s). */
export async function readJsonBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
