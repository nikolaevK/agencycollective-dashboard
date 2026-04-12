export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getCalendarEvents } from "@/lib/google/calendar";
import { getDb, ensureMigrated } from "@/lib/db";

export async function GET(request: NextRequest) {
  const adminSession = getAdminSession();
  const closerSession = getCloserSession();

  if (!adminSession && !closerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;

  // Default to current week
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const timeMin = searchParams.get("timeMin") || startOfWeek.toISOString();
  const timeMax = searchParams.get("timeMax") || endOfWeek.toISOString();

  // Fetch closer emails so we can also pull events from their calendars
  // (Workspace-shared calendars not in the subscribed calendarList)
  let closerEmails: string[] = [];
  try {
    await ensureMigrated();
    const db = getDb();
    const closerRows = await db.execute("SELECT email FROM closers WHERE status = 'active'");
    closerEmails = closerRows.rows.map((r) => String(r.email)).filter(Boolean);
  } catch (err) {
    console.warn("[calendar-events] Could not fetch closer emails:", err);
  }

  try {
    const events = await getCalendarEvents(timeMin, timeMax, closerEmails);
    return NextResponse.json({ data: events });
  } catch (err) {
    console.error("[calendar-events] Error:", err);
    return NextResponse.json({ data: [] });
  }
}
