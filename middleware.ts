import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/portal")) {
    if (!request.cookies.has("u_sess"))
      return NextResponse.redirect(new URL("/login", request.url));
  }
  if (request.nextUrl.pathname === "/login") {
    if (request.cookies.has("u_sess"))
      return NextResponse.redirect(new URL("/portal/overview", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/portal/:path*", "/login"] };
