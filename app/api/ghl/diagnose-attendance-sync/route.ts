export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getAppointmentsByContact } from "@/lib/ghl/calendars";
import { eventCompositeKey } from "@/lib/ghl/crossReference";
import { getGhlConfig, isGhlConfigured, describeError } from "@/lib/ghl/client";
import { listAllLinks } from "@/lib/ghlAppointmentLinks";
import { getLatestAttendanceByEvent } from "@/lib/eventAttendance";
import type { GhlContactAppointment } from "@/types/ghl";

/**
 * Diagnostic endpoint for the GHL attendance sync. Hit this with a list of
 * Google events the closer/admin sees in their calendar and it'll return:
 *   - whether GHL is configured + the resolved locationId
 *   - how many GHL appointments the bulk fetch returned (the data the
 *     discovery pass searches against)
 *   - for each provided Google event: its computed composite key, the
 *     matched GHL appointment (if any), and the 3 closest GHL keys when no
 *     match — so you can eyeball where (title, start, end) differ
 *
 * Usage:
 *   POST /api/ghl/diagnose-attendance-sync
 *   body: { events: [{ id, title, start, end }] }
 */
export async function POST(request: Request) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGhlConfigured()) {
    return NextResponse.json({
      configured: false,
      hint: "Set GHL_PIT and GHL_LOCATION_ID in .env.local",
    });
  }

  const { locationId } = getGhlConfig();

  let body: { events?: Array<{ id?: string; title?: string | null; start?: string | null; end?: string | null }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];

  let apptsByContact: Map<string, GhlContactAppointment[]> | null = null;
  let ghlFetchError: string | null = null;
  try {
    apptsByContact = await getAppointmentsByContact();
  } catch (err) {
    ghlFetchError = describeError(err);
  }

  const ghlAppointments: Array<{ id: string; title: string | null; startTime: string | null; endTime: string | null; key: string | null; status: string | null; contactId: string }> = [];
  if (apptsByContact) {
    for (const [contactId, appts] of apptsByContact) {
      for (const appt of appts) {
        ghlAppointments.push({
          id: appt.id ?? "",
          title: appt.title ?? null,
          startTime: appt.startTime ?? null,
          endTime: appt.endTime ?? null,
          key: eventCompositeKey({
            title: appt.title,
            startTime: appt.startTime,
            endTime: appt.endTime,
          }),
          status: appt.appointmentStatus ?? null,
          contactId,
        });
      }
    }
  }

  const keyToAppt = new Map<string, typeof ghlAppointments[number]>();
  for (const a of ghlAppointments) {
    if (a.key && !keyToAppt.has(a.key)) keyToAppt.set(a.key, a);
  }

  const eventResults = events.map((evt) => {
    const key = eventCompositeKey({
      title: evt.title ?? null,
      startTime: evt.start ?? null,
      endTime: evt.end ?? null,
    });
    const matched = key ? keyToAppt.get(key) ?? null : null;

    // When no match, surface the 3 closest GHL keys by start-time delta so the
    // operator can see whether title or time is what's mismatching.
    let nearest: Array<{ key: string; deltaMs: number; appt: typeof ghlAppointments[number] }> = [];
    if (!matched && evt.start) {
      const evtStartMs = Date.parse(evt.start);
      if (Number.isFinite(evtStartMs)) {
        nearest = ghlAppointments
          .filter((a) => a.startTime)
          .map((a) => {
            const ms = Date.parse(a.startTime as string);
            return { key: a.key ?? "", deltaMs: Math.abs(ms - evtStartMs), appt: a };
          })
          .filter((x) => Number.isFinite(x.deltaMs))
          .sort((a, b) => a.deltaMs - b.deltaMs)
          .slice(0, 3);
      }
    }

    return {
      googleEventId: evt.id ?? null,
      googleTitle: evt.title ?? null,
      googleStart: evt.start ?? null,
      googleEnd: evt.end ?? null,
      computedKey: key,
      matchedGhl: matched,
      nearestGhlByStart: nearest.map((n) => ({
        deltaMs: n.deltaMs,
        ghlKey: n.key,
        ghlTitle: n.appt.title,
        ghlStart: n.appt.startTime,
        ghlEnd: n.appt.endTime,
        ghlId: n.appt.id,
      })),
    };
  });

  const links = await listAllLinks();
  const attendance = await getLatestAttendanceByEvent();

  return NextResponse.json({
    configured: true,
    locationId,
    ghlFetchError,
    ghlAppointmentCount: ghlAppointments.length,
    sampleGhlAppointments: ghlAppointments.slice(0, 5),
    existingLinkRowCount: links.length,
    sampleLinks: links.slice(0, 5).map((l) => ({
      googleEventId: l.googleEventId,
      ghlAppointmentId: l.ghlAppointmentId,
      dashboardStatus: l.dashboardStatus,
      ghlStatus: l.ghlStatus,
      syncState: l.syncState,
      lastError: l.lastError,
    })),
    dashboardAttendanceCount: Object.keys(attendance).length,
    events: eventResults,
  });
}
