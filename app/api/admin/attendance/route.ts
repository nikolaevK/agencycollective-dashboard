export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { getAllAttendance } from "@/lib/eventAttendance";
import { findCloser } from "@/lib/closers";
import { getDb, ensureMigrated } from "@/lib/db";
import { logAuditEvent } from "@/lib/auditLog";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await getAllAttendance();
  // Build a map: eventId -> { showStatus, closerId }. Records arrive
  // ORDER BY updated_at DESC, so the first row we see for each event is
  // the newest. Skip subsequent rows or the overwrite loop ends up keeping
  // the OLDEST mark — which caused admin + closer portals to disagree on
  // multi-closer events.
  const data: Record<string, { showStatus: string; closerId: string }> = {};
  for (const r of records) {
    if (r.googleEventId in data) continue;
    data[r.googleEventId] = { showStatus: r.showStatus, closerId: r.closerId };
  }
  return NextResponse.json({ data });
}

interface ReassignBody {
  eventId?: string;
  fromCloserId?: string;
  toCloserId?: string;
}

/**
 * Reassign an event_attendance row to a different closer — a pure
 * column UPDATE of `closer_id`, with one wrinkle: the table's primary
 * key is `(google_event_id, closer_id)`, so if the target closer already
 * has a row for this event we'd hit a UNIQUE constraint conflict.
 *
 * To handle that we batch a `DELETE WHERE (event, toCloser)` ahead of
 * the UPDATE so a conflicting row is cleared first (rare case — two
 * closers happened to both mark the same event). Other closers' rows
 * for the event are left alone; this is targeted at one row, not a
 * wipe-and-replace.
 *
 * Requires an admin session. Audit-logged.
 */
export async function PATCH(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ReassignBody;
  try {
    body = (await request.json()) as ReassignBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = String(body.eventId ?? "").trim();
  const fromCloserId = String(body.fromCloserId ?? "").trim();
  const toCloserId = String(body.toCloserId ?? "").trim();
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  if (!fromCloserId) return NextResponse.json({ error: "fromCloserId is required" }, { status: 400 });
  if (!toCloserId) return NextResponse.json({ error: "toCloserId is required" }, { status: 400 });

  if (fromCloserId === toCloserId) {
    return NextResponse.json({ data: { eventId, closerId: toCloserId, reassigned: false } });
  }

  const target = await findCloser(toCloserId);
  if (!target) return NextResponse.json({ error: "Target closer not found" }, { status: 404 });
  if (target.status !== "active") {
    return NextResponse.json({ error: "Target closer is not active" }, { status: 400 });
  }

  await ensureMigrated();
  const db = getDb();

  // Batch handles the (rare) case where the target closer already has a
  // row for the same event — DELETE clears the conflict, UPDATE flips
  // ownership of the original row. If no conflicting row exists, the
  // DELETE is a no-op. If the source row doesn't exist either, the
  // UPDATE affects zero rows and we surface a 404.
  const result = await db.batch(
    [
      {
        sql: "DELETE FROM event_attendance WHERE google_event_id = ? AND closer_id = ?",
        args: [eventId, toCloserId],
      },
      {
        sql: `UPDATE event_attendance
                 SET closer_id = ?, updated_at = datetime('now')
               WHERE google_event_id = ? AND closer_id = ?`,
        args: [toCloserId, eventId, fromCloserId],
      },
    ],
    "write"
  );

  const updateRows = result[1]?.rowsAffected ?? 0;
  if (updateRows === 0) {
    return NextResponse.json(
      { error: "No event_attendance row matched (eventId, fromCloserId)" },
      { status: 404 }
    );
  }

  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "attendance.reassign",
    targetType: "event_attendance",
    targetId: eventId,
    details: JSON.stringify({ fromCloserId, toCloserId }),
  });

  return NextResponse.json({
    data: { eventId, closerId: toCloserId, reassigned: true, fromCloserId },
  });
}
