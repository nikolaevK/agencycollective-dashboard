export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { listAdminInbox } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Admin inbox — one row per conversation that has messages, sorted by last
 * activity, with the per-conversation unread count baked in. Single query.
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single shared bucket for all admin read-side traffic. 180/min covers
  // legitimate steady-state across multiple open threads + inbox + heartbeat
  // + badges (~13/min realistic peak), with ~14× headroom.
  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const inbox = await listAdminInbox();
  return NextResponse.json({ data: inbox });
}
