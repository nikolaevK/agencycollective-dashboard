export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getLatestAttendanceByEvent } from "@/lib/eventAttendance";

/**
 * Team-wide attendance index keyed by googleEventId. Admins, closers, and
 * setters all read from here so the calendar surfaces share one source of
 * truth for show/no-show pills. Closers still write via /api/closer/attendance
 * (scoped to their own closer_id) — this is read-only.
 */
export async function GET() {
  const adminSession = getAdminSession();
  const closerSession = getCloserSession();

  if (!adminSession && !closerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getLatestAttendanceByEvent();
  return NextResponse.json({ data });
}
