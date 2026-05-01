export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAdminPresence } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * "Team is online" indicator — true if any admin's heartbeat is within the
 * presence window (60s). Cheap single-row aggregate.
 */
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:client:${session.userId}`, 120);
  if (limited) return limited;

  const presence = await getAdminPresence();
  return NextResponse.json({ data: presence });
}
