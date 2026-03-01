import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("u_sess");

  // Protect slug-based portal routes: /{slug}/portal/*
  if (/^\/[^/]+\/portal(\/|$)/.test(pathname)) {
    if (!hasSession)
      return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:slug/portal/:path*"],
};
