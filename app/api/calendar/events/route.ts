export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getCalendarEvents } from "@/lib/google/calendar";

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

  try {
    const events = await getCalendarEvents(timeMin, timeMax);
    return NextResponse.json({ data: events });
  } catch (err) {
    console.error("[calendar-events] Error:", err);
    return NextResponse.json({ data: [] });
  }
}
