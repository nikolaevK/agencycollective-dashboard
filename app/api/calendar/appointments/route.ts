export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { getAppointmentsIndex } from "@/lib/appointments";

/**
 * Returns a map of { googleEventId → latest setter claim } for use in the
 * calendar event list on closer + admin surfaces. Setters have their own
 * endpoint (/api/closer/setter/appointments) that returns only their own
 * claims — they aren't served this aggregate view.
 */
export async function GET() {
  const adminSession = getAdminSession();
  const closerSession = getCloserSession();

  if (!adminSession && !closerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Block setter sessions even when an admin cookie coexists in the browser —
  // role is the authority, not whichever session happened to validate first.
  // A setter opening the admin login tab shouldn't unlock this endpoint.
  if (closerSession) {
    const closer = await findCloser(closerSession.closerId);
    if (!closer || closer.role === "setter") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const index = await getAppointmentsIndex();
  return NextResponse.json({ data: index });
}
