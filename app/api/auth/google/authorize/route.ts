export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/?portal=admin", process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000"));
  }

  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[google-auth] Failed to generate auth URL:", err);
    return NextResponse.json(
      { error: "Google OAuth not configured. Check environment variables." },
      { status: 500 }
    );
  }
}
