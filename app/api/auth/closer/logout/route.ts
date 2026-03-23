export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CLOSER_SESSION_COOKIE_NAME } from "@/lib/closerSession";

export async function POST() {
  cookies().set(CLOSER_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
