export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { setEventAttendance, getAttendanceByCloser, deleteEventAttendance } from "@/lib/eventAttendance";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const attendance = await getAttendanceByCloser(session.closerId);
  // Convert Map to plain object for JSON
  const data: Record<string, string> = {};
  attendance.forEach((status, eventId) => {
    data[eventId] = status;
  });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const showStatus = String(body.showStatus ?? "").trim();

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }
    if (showStatus !== "showed" && showStatus !== "no_show") {
      return NextResponse.json({ error: "showStatus must be 'showed' or 'no_show'" }, { status: 400 });
    }

    await setEventAttendance(eventId, session.closerId, showStatus);
    return NextResponse.json({ data: { eventId, showStatus } });
  } catch (err) {
    console.error("[closer/attendance PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  await deleteEventAttendance(eventId, session.closerId);
  return NextResponse.json({ ok: true });
}
