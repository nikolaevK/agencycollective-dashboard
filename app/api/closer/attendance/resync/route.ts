export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import {
  syncEventAttendanceToGhl,
  syncEventAttendanceFromGhl,
} from "@/lib/attendanceSync";
import { getLatestAttendanceByEvent } from "@/lib/eventAttendance";

interface ResyncBody {
  eventId?: string;
  direction?: string;
  eventTitle?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
}

/**
 * Manual force-sync handle for the "Push" / "Pull" buttons on the
 * out-of-sync chip. Either platform's status can win — the human decides.
 *
 *   direction = "push" → write dashboard's current state to GHL.
 *   direction = "pull" → write GHL's current state to dashboard.
 *
 * Closer sessions push their own attendance. Admin sessions push whatever
 * the team-wide latest mark says (and pull falls back to GHL's assignedUser
 * name resolution for attribution).
 */
export async function POST(request: Request) {
  const adminSession = getAdminSession();
  const closerSession = getCloserSession();
  if (!adminSession && !closerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ResyncBody;
  try {
    body = (await request.json()) as ResyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = String(body.eventId ?? "").trim();
  const direction = String(body.direction ?? "").trim();

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }
  if (direction !== "push" && direction !== "pull") {
    return NextResponse.json(
      { error: "direction must be 'push' or 'pull'" },
      { status: 400 }
    );
  }

  const evt = {
    googleEventId: eventId,
    title: body.eventTitle ?? null,
    startTime: body.eventStart ?? null,
    endTime: body.eventEnd ?? null,
  };

  if (direction === "push") {
    // Push the team-wide latest mark, not the requesting closer's own row.
    // The chip on the UI shows team-wide status — the Push button has to
    // match what the closer sees. Earlier we used per-closer marks and that
    // sent "confirmed" whenever the clicker hadn't personally marked the
    // event, even though a teammate had marked it "showed".
    const teamLatest = await getLatestAttendanceByEvent();
    const dashboardStatus =
      (teamLatest[eventId] as "showed" | "no_show" | undefined) ?? null;
    const result = await syncEventAttendanceToGhl({ evt, dashboardStatus });
    return NextResponse.json({ data: result });
  }

  // direction === "pull"
  // Closer: attribute to themselves so the pulled GHL status lands on their
  // event_attendance row (matches the existing dashboard-write convention).
  // Admin: rely on GHL's assignedUserId → name resolution. If no match, the
  // sync layer returns outcome="needs_attribution".
  const result = await syncEventAttendanceFromGhl({
    evt,
    closerId: closerSession?.closerId,
  });
  return NextResponse.json({ data: result });
}
