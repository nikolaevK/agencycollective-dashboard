export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getGhlConfig, isGhlConfigured } from "@/lib/ghl/client";
import { findLinkByGoogleEventId } from "@/lib/ghlAppointmentLinks";
import { getGhlAppointment } from "@/lib/ghl/appointments";

/**
 * Raw PUT diagnostic. Bypasses the ghlRequest wrapper so we see exactly
 * what GHL responds with — status code, headers, full body, no error
 * normalization. Use this to debug "200 but nothing changed" failures.
 *
 * POST body: { googleEventId: string, status: "showed" | "noshow" | "confirmed" | ... }
 * Response: GET-before, PUT request body, PUT response (status/headers/body), GET-after
 */
export async function POST(request: Request) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isGhlConfigured()) {
    return NextResponse.json({ error: "GHL not configured" }, { status: 503 });
  }

  let body: { googleEventId?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const googleEventId = String(body.googleEventId ?? "").trim();
  const status = String(body.status ?? "showed").trim();
  if (!googleEventId) {
    return NextResponse.json({ error: "googleEventId required" }, { status: 400 });
  }

  const link = await findLinkByGoogleEventId(googleEventId);
  if (!link) {
    return NextResponse.json({
      error: "No link row for that googleEventId",
      hint: "Run /api/calendar/attendance POST first to discover the link",
    });
  }

  const { pit } = getGhlConfig();
  const ghlAppointmentId = link.ghlAppointmentId;
  const url = `https://services.leadconnectorhq.com/calendars/events/appointments/${encodeURIComponent(ghlAppointmentId)}`;

  // Step 1: GET the appointment so we can round-trip canonical fields.
  let getBefore: { status: number; body: unknown } | null = null;
  let snapshot: Awaited<ReturnType<typeof getGhlAppointment>> = null;
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: "2023-02-21",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await r.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    getBefore = { status: r.status, body: parsed };
  } catch (err) {
    getBefore = { status: 0, body: err instanceof Error ? err.message : String(err) };
  }

  try {
    snapshot = await getGhlAppointment(ghlAppointmentId);
  } catch {
    // already captured raw above
  }

  // Step 2: PUT with the full canonical body.
  const putBody: Record<string, unknown> = { appointmentStatus: status };
  if (snapshot?.calendarId) putBody.calendarId = snapshot.calendarId;
  if (snapshot?.startTime) putBody.startTime = snapshot.startTime;
  if (snapshot?.endTime) putBody.endTime = snapshot.endTime;
  if (snapshot?.title) putBody.title = snapshot.title;
  if (snapshot?.assignedUserId) putBody.assignedUserId = snapshot.assignedUserId;

  let putResp: { status: number; headers: Record<string, string>; body: unknown } | null = null;
  try {
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: "2023-02-21",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(putBody),
      cache: "no-store",
    });
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    const text = await r.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    putResp = { status: r.status, headers, body: parsed };
  } catch (err) {
    putResp = { status: 0, headers: {}, body: err instanceof Error ? err.message : String(err) };
  }

  // Step 3: GET again to see if anything changed.
  let getAfter: { status: number; body: unknown } | null = null;
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: "2023-02-21",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await r.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    getAfter = { status: r.status, body: parsed };
  } catch (err) {
    getAfter = { status: 0, body: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    googleEventId,
    ghlAppointmentId,
    targetStatus: status,
    putBodySent: putBody,
    getBefore,
    putResponse: putResp,
    getAfter,
    link,
  });
}
