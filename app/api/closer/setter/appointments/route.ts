export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSetterFromSession } from "@/lib/closerGuards";
import {
  listAppointmentsBySetter,
  upsertAppointment,
  deleteAppointment,
  isPreCallStatus,
  isPostCallStatus,
} from "@/lib/appointments";
import { reassignDealsForEvent } from "@/lib/setterAttribution";

export async function GET() {
  const setter = await getSetterFromSession();
  if (!setter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listAppointmentsBySetter(setter.id);
  const byEvent: Record<string, typeof rows[number]> = {};
  for (const r of rows) byEvent[r.googleEventId] = r;
  return NextResponse.json({ data: { appointments: rows, byEvent } });
}

export async function POST(request: Request) {
  const setter = await getSetterFromSession();
  if (!setter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const googleEventId = String(body.googleEventId ?? "").trim();
  if (!googleEventId) {
    return NextResponse.json({ error: "googleEventId is required" }, { status: 400 });
  }

  // Bound the notes field so a buggy client or rogue setter can't park
  // megabytes per appointment. 10k chars = ~2.5 pages of single-spaced
  // text, plenty for any prep note.
  if (body.notes != null && String(body.notes).length > 10_000) {
    return NextResponse.json({ error: "Notes must be 10,000 characters or fewer" }, { status: 400 });
  }

  const preCallRaw = body.preCallStatus;
  if (preCallRaw !== undefined && !isPreCallStatus(preCallRaw)) {
    return NextResponse.json({ error: "Invalid preCallStatus" }, { status: 400 });
  }

  const postCallRaw = body.postCallStatus;
  if (postCallRaw !== undefined && !isPostCallStatus(postCallRaw)) {
    return NextResponse.json({ error: "Invalid postCallStatus" }, { status: 400 });
  }

  function optionalString(v: unknown): string | null | undefined {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const trimmed = String(v).trim();
    return trimmed.length ? trimmed : null;
  }

  const record = await upsertAppointment({
    setterId: setter.id,
    googleEventId,
    clientName: optionalString(body.clientName),
    clientEmail: optionalString(body.clientEmail),
    scheduledAt:
      body.scheduledAt === undefined
        ? undefined
        : body.scheduledAt == null
        ? null
        : String(body.scheduledAt),
    preCallStatus: isPreCallStatus(preCallRaw) ? preCallRaw : undefined,
    postCallStatus: isPostCallStatus(postCallRaw) ? postCallRaw : undefined,
    notes:
      body.notes === undefined
        ? undefined
        : body.notes == null
        ? null
        : String(body.notes),
  });

  // Backfill: any existing deal linked to this event gets this setter credited
  // (or re-credited to a later claimer if rules change).
  await reassignDealsForEvent(googleEventId);

  return NextResponse.json({ data: record });
}

export async function DELETE(request: Request) {
  const setter = await getSetterFromSession();
  if (!setter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const deleted = await deleteAppointment(setter.id, eventId);
  // Re-resolve attribution: if another setter had also claimed this event,
  // credit shifts to them; otherwise setter_id on linked deals clears.
  await reassignDealsForEvent(eventId);
  return NextResponse.json({ data: { deleted } });
}
