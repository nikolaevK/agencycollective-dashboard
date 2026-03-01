import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/adminSession";

export async function POST() {
  cookies().delete(ADMIN_SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
