import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE  = "a_sess";
const PORTAL_COOKIE = "u_sess";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET ?? "";

  // ── Admin dashboard (/dashboard and /dashboard/*) ────────────────────────
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    const valid = secret ? await verifyToken(token, secret) : false;
    if (!valid) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete(ADMIN_COOKIE);
      return res;
    }
  }

  // ── Client portal (/{slug}/portal/*) ────────────────────────────────────
  if (/^\/[^/]+\/portal(\/|$)/.test(pathname)) {
    const token = request.cookies.get(PORTAL_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Portal token uses the same signing scheme
    const valid = secret ? await verifyToken(token, secret) : false;
    if (!valid) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete(PORTAL_COOKIE);
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:slug/portal/:path*", "/dashboard", "/dashboard/:path*"],
};
