export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { getAllAttendance } from "@/lib/eventAttendance";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await getAllAttendance();
  // Build a map: eventId -> { showStatus, closerId }
  const data: Record<string, { showStatus: string; closerId: string }> = {};
  for (const r of records) {
    data[r.googleEventId] = { showStatus: r.showStatus, closerId: r.closerId };
  }
  return NextResponse.json({ data });
}
