export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserUnreadCount } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Tiny endpoint — single int — driving the portal sidebar badge. Polled
 * every 60s app-wide so we keep it cheap.
 */
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:client:${session.userId}`, 120);
  if (limited) return limited;

  const count = await getUserUnreadCount(session.userId);
  return NextResponse.json({ data: { count } });
}
