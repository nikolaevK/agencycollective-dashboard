export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { exchangeCode, getOAuthClient } from "@/lib/google/oauth";
import { saveCalendarConfig } from "@/lib/google/tokenStorage";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/?portal=admin", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard/closers/calendar?error=no_code", request.url)
    );
  }

  try {
    const tokens = await exchangeCode(code);

    // Get the email of the connected account
    let email: string | null = null;
    try {
      const auth = getOAuthClient();
      auth.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email ?? null;
    } catch {
      // Non-critical — email is just for display
    }

    await saveCalendarConfig(tokens, email, session.adminId);

    return NextResponse.redirect(
      new URL("/dashboard/closers/calendar?connected=true", request.url)
    );
  } catch (err) {
    console.error("[google-callback] Token exchange failed:", err);
    return NextResponse.redirect(
      new URL("/dashboard/closers/calendar?error=token_exchange", request.url)
    );
  }
}
