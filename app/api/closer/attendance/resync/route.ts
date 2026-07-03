export const dynamic = "force-dynamic";
// Push: GET + PUT against GHL. Pull: GET + DB batch. Either can hit
// rate-limit retries when the bulk cache is cold or busy.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getActiveCloserSession } from "@/lib/closerGuards";
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
  /**
   * Explicit context flag. The admin team-calendar sets `asAdmin: true`;
   * the closer portal omits it. Without this, the server can't tell
   * which surface the click came from when the user happens to be signed
   * in to both portals at once (their closer cookie would otherwise be
   * used as an attribution shortcut even when they're acting as admin).
   */
  asAdmin?: boolean;
}

/**
 * Manual force-sync handle for the "Push" / "Pull" buttons on the
 * out-of-sync chip. Either platform's status can win — the human decides.
 *
 *   direction = "push" → write dashboard's current state to GHL.
 *   direction = "pull" → write GHL's current state to dashboard.
 *
 * Push always sends the team-wide latest mark (matches what the chip
 * displays). Pull attribution depends on context:
 *
 *   - asAdmin (sent by /dashboard/closers/calendar): the admin is doing
 *     ops work, NOT claiming attribution. Use GHL's assignedUserId →
 *     name resolution as the only attribution source. If GHL has no
 *     assigned user or name doesn't match a closer, leave existing
 *     event_attendance rows alone (needs_attribution).
 *
 *   - default (sent by /closer/calendar): the closer attributes the
 *     pulled status to themselves. Matches the existing dashboard-write
 *     convention where a closer clicking on their own calendar always
 *     writes their own row.
 *
 * Without this split, an admin who was also signed in as a closer
 * silently re-attributed every event they pulled to their own closer
 * row, regardless of who GHL actually had assigned.
 */
export async function POST(request: Request) {
  const adminSession = getAdminSession();
  const closerSession = await getActiveCloserSession();
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
  const asAdmin = body.asAdmin === true;

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }
  if (direction !== "push" && direction !== "pull") {
    return NextResponse.json(
      { error: "direction must be 'push' or 'pull'" },
      { status: 400 }
    );
  }
  if (asAdmin && !adminSession) {
    // Defense-in-depth: a closer-only session cannot opt into admin
    // attribution mode by toggling a body flag.
    return NextResponse.json(
      { error: "asAdmin requires an admin session" },
      { status: 403 }
    );
  }

  const evt = {
    googleEventId: eventId,
    title: body.eventTitle ?? null,
    startTime: body.eventStart ?? null,
    endTime: body.eventEnd ?? null,
  };

  if (direction === "push") {
    const teamLatest = await getLatestAttendanceByEvent([eventId]);
    const dashboardStatus =
      (teamLatest[eventId] as "showed" | "no_show" | undefined) ?? null;
    const result = await syncEventAttendanceToGhl({ evt, dashboardStatus });
    return NextResponse.json({ data: result });
  }

  // direction === "pull"
  // asAdmin: never pass the closer cookie as an attribution shortcut even
  // if the request happens to carry one. Force name-based resolution.
  const result = await syncEventAttendanceFromGhl({
    evt,
    closerId: asAdmin ? undefined : closerSession?.closerId,
  });
  return NextResponse.json({ data: result });
}
