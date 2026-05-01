export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getAdminTotalUnreadCount } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Single int — drives the admin sidebar Support badge. Sums unread across
 * all client conversations (per-admin unread isn't a thing here; any admin
 * reading clears the count for the team).
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const count = await getAdminTotalUnreadCount();
  return NextResponse.json({ data: { count } });
}
