import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE  = "a_sess";
const PORTAL_COOKIE = "u_sess";
const CLOSER_COOKIE = "c_sess";

/**
 * Verify an HMAC-SHA256 signed session token using the Web Crypto API.
 * This is Edge-runtime compatible (no Node.js `crypto` module needed).
 * Token format: base64url(payload).hexsig
 */
async function verifyToken(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;

  const payload = token.slice(0, dot);
  const sigHex  = token.slice(dot + 1);

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expected  = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time string comparison
    if (expected.length !== sigHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Decode the base64url payload without signature verification (caller must verify first).
 * Returns null if the token is expired.
 */
function decodePayload(token: string): Record<string, unknown> | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  try {
    const payload = token.slice(0, dot);
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    // Enforce token expiration at the middleware level
    if (data.exp && Math.floor(Date.now() / 1000) > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** Map route patterns to required permission keys. */
type PermKey = "dashboard" | "analyst" | "studio" | "adcopy" | "users" | "closers" | "admin";

const ROUTE_PERMISSIONS: { match: (p: string) => boolean; perm: PermKey }[] = [
  { match: (p) => p === "/dashboard/chat", perm: "analyst" },
  { match: (p) => p.startsWith("/dashboard/generate"), perm: "studio" },
  { match: (p) => p.startsWith("/dashboard/ad-copy"), perm: "adcopy" },
  { match: (p) => p.startsWith("/dashboard/users"), perm: "users" },
  { match: (p) => p.startsWith("/dashboard/closers"), perm: "closers" },
  { match: (p) => p.startsWith("/dashboard/admins"), perm: "admin" },
  // Dashboard overview, accounts, alerts, settings need 'dashboard'
  { match: (p) => p === "/dashboard" || p.startsWith("/dashboard/accounts") || p === "/dashboard/alerts" || p === "/dashboard/settings", perm: "dashboard" },
];

/** Map API routes to required permissions (defense in depth). */
const API_PERMISSIONS: { match: (p: string) => boolean; perm: PermKey }[] = [
  { match: (p) => p.startsWith("/api/chat"), perm: "analyst" },
  { match: (p) => p.startsWith("/api/generate"), perm: "studio" },
  { match: (p) => p.startsWith("/api/ad-copy"), perm: "adcopy" },
  { match: (p) => p.startsWith("/api/admin/users"), perm: "users" },
  { match: (p) => p.startsWith("/api/admin/closers"), perm: "closers" },
  { match: (p) => p.startsWith("/api/admin/deals"), perm: "closers" },
  { match: (p) => p.startsWith("/api/admin/payouts"), perm: "closers" },
  { match: (p) => p.startsWith("/api/admin/audit-log"), perm: "admin" },
  { match: (p) => p.startsWith("/api/admin/admins"), perm: "admin" },
  { match: (p) => p.startsWith("/api/accounts"), perm: "dashboard" },
  { match: (p) => p.startsWith("/api/ads"), perm: "dashboard" },
  { match: (p) => p.startsWith("/api/adsets"), perm: "dashboard" },
  { match: (p) => p.startsWith("/api/campaigns"), perm: "dashboard" },
  { match: (p) => p.startsWith("/api/insights"), perm: "dashboard" },
  { match: (p) => p.startsWith("/api/alerts"), perm: "dashboard" },
  { match: (p) => p.startsWith("/api/settings"), perm: "dashboard" },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET ?? "";

  // ── Admin dashboard (/dashboard and /dashboard/*) ────────────────────────
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    // Allow the unauthorized page without further permission checks
    if (pathname === "/dashboard/unauthorized") {
      const token = request.cookies.get(ADMIN_COOKIE)?.value;
      if (!token) return NextResponse.redirect(new URL("/?portal=admin", request.url));
      const valid = secret ? await verifyToken(token, secret) : false;
      if (!valid) {
        const res = NextResponse.redirect(new URL("/?portal=admin", request.url));
        res.cookies.delete(ADMIN_COOKIE);
        return res;
      }
      return NextResponse.next();
    }

    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/?portal=admin", request.url));
    }
    const valid = secret ? await verifyToken(token, secret) : false;
    if (!valid) {
      const res = NextResponse.redirect(new URL("/?portal=admin", request.url));
      res.cookies.delete(ADMIN_COOKIE);
      return res;
    }

    // ── Per-route permission enforcement ──────────────────────────────────
    const data = decodePayload(token);
    if (data) {
      const isSuper = Boolean(data.isSuper);
      if (!isSuper) {
        const perms = (data.permissions ?? {}) as Record<string, boolean>;
        for (const route of ROUTE_PERMISSIONS) {
          if (route.match(pathname) && !perms[route.perm]) {
            return NextResponse.redirect(new URL("/dashboard/unauthorized", request.url));
          }
        }
      }
    }
  }

  // ── Admin API routes — permission enforcement ────────────────────────────
  if (pathname.startsWith("/api/")) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (token && secret) {
      const valid = await verifyToken(token, secret);
      if (valid) {
        const data = decodePayload(token);
        if (data && !Boolean(data.isSuper)) {
          const perms = (data.permissions ?? {}) as Record<string, boolean>;
          for (const route of API_PERMISSIONS) {
            if (route.match(pathname) && !perms[route.perm]) {
              return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
          }
        }
      }
    }
  }

  // ── Closer portal (/closer/*) ────────────────────────────────────────────
  if (pathname.startsWith("/closer/") && pathname !== "/closer/login") {
    const token = request.cookies.get(CLOSER_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/?portal=closer", request.url));
    }
    const valid = secret ? await verifyToken(token, secret) : false;
    if (!valid) {
      const res = NextResponse.redirect(new URL("/?portal=closer", request.url));
      res.cookies.delete(CLOSER_COOKIE);
      return res;
    }
  }

  // ── Closer portal API routes — session enforcement ────────────────────
  if (pathname.startsWith("/api/closer/")) {
    const token = request.cookies.get(CLOSER_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const valid = secret ? await verifyToken(token, secret) : false;
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Client portal (/{slug}/portal/*) ────────────────────────────────────
  if (/^\/[^/]+\/portal(\/|$)/.test(pathname)) {
    const token = request.cookies.get(PORTAL_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/?portal=client", request.url));
    }
    // Portal token uses the same signing scheme
    const valid = secret ? await verifyToken(token, secret) : false;
    if (!valid) {
      const res = NextResponse.redirect(new URL("/?portal=client", request.url));
      res.cookies.delete(PORTAL_COOKIE);
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/:slug/portal/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/closer/:path*",
    "/api/chat/:path*",
    "/api/generate/:path*",
    "/api/ad-copy/:path*",
    "/api/admin/users/:path*",
    "/api/admin/closers/:path*",
    "/api/admin/deals/:path*",
    "/api/admin/payouts/:path*",
    "/api/admin/audit-log/:path*",
    "/api/admin/admins/:path*",
    "/api/closer/:path*",
    "/api/calendar/:path*",
    "/api/accounts/:path*",
    "/api/ads/:path*",
    "/api/adsets/:path*",
    "/api/campaigns/:path*",
    "/api/insights/:path*",
    "/api/alerts/:path*",
    "/api/settings/:path*",
  ],
};
