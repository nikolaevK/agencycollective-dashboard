export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import {
  setEventAttendance,
  getAttendanceByCloser,
  deleteEventAttendance,
} from "@/lib/eventAttendance";
import {
  syncEventAttendanceToGhl,
  type SyncResult,
} from "@/lib/attendanceSync";

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

interface AttendancePatchBody {
  eventId?: string;
  showStatus?: string;
  // Optional event coordinates so the sync layer can resolve a new GHL
  // appointment link via composite key on first sight. Without them, sync
  // only fires for events that already have a stored link.
  eventTitle?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
}

export async function PATCH(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AttendancePatchBody;
  try {
    body = (await request.json()) as AttendancePatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = String(body.eventId ?? "").trim();
  const showStatus = String(body.showStatus ?? "").trim();

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }
  if (showStatus !== "showed" && showStatus !== "no_show") {
    return NextResponse.json(
      { error: "showStatus must be 'showed' or 'no_show'" },
      { status: 400 }
    );
  }

  // Step 1: write dashboard side. Succeeds even if GHL is unreachable.
  try {
    await setEventAttendance(eventId, session.closerId, showStatus);
  } catch (err) {
    console.error("[closer/attendance PATCH] dashboard write failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Step 2: best-effort GHL sync. Failures don't roll back the dashboard
  // write — the out-of-sync chip + force-sync button cover recovery.
  let sync: SyncResult;
  try {
    sync = await syncEventAttendanceToGhl({
      evt: {
        googleEventId: eventId,
        title: body.eventTitle ?? null,
        startTime: body.eventStart ?? null,
        endTime: body.eventEnd ?? null,
      },
      dashboardStatus: showStatus,
    });
  } catch (err) {
    console.error("[closer/attendance PATCH] sync failed:", err);
    sync = {
      outcome: "out_of_sync",
      syncState: "out_of_sync",
      ghlStatus: null,
      dashboardStatus: showStatus,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json({
    data: {
      eventId,
      showStatus,
      sync: {
        outcome: sync.outcome,
        syncState: sync.syncState,
        ghlStatus: sync.ghlStatus,
      },
    },
  });
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

  // Step 1: clear the dashboard row.
  try {
    await deleteEventAttendance(eventId, session.closerId);
  } catch (err) {
    console.error("[closer/attendance DELETE] dashboard write failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Step 2: best-effort GHL reset to "confirmed". Only fires for events
  // that already have a link row — non-GHL events and never-synced events
  // are no-ops.
  const eventTitle = searchParams.get("eventTitle");
  const eventStart = searchParams.get("eventStart");
  const eventEnd = searchParams.get("eventEnd");
  let sync: SyncResult;
  try {
    sync = await syncEventAttendanceToGhl({
      evt: {
        googleEventId: eventId,
        title: eventTitle,
        startTime: eventStart,
        endTime: eventEnd,
      },
      dashboardStatus: null,
    });
  } catch (err) {
    console.error("[closer/attendance DELETE] sync failed:", err);
    sync = {
      outcome: "out_of_sync",
      syncState: "out_of_sync",
      ghlStatus: null,
      dashboardStatus: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json({
    ok: true,
    sync: {
      outcome: sync.outcome,
      syncState: sync.syncState,
      ghlStatus: sync.ghlStatus,
    },
  });
}
