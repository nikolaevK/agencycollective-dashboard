export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { recordAdminHeartbeat } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Heartbeat upsert. Posted by the admin shell every 60s while the tab is
 * focused so the client portal's presence indicator stays accurate.
 */
export async function POST() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  await recordAdminHeartbeat(session.adminId);
  return NextResponse.json({ ok: true });
}
