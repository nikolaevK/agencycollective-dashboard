import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect client portal routes: /{slug}/portal/*
  if (/^\/[^/]+\/portal(\/|$)/.test(pathname)) {
    if (!request.cookies.has("u_sess"))
      return NextResponse.redirect(new URL("/login", request.url));
  }

  // Protect admin dashboard routes: /dashboard and /dashboard/*
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!request.cookies.has("a_sess"))
      return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:slug/portal/:path*", "/dashboard", "/dashboard/:path*"],
};
