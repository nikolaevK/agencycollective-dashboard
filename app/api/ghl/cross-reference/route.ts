export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { buildCrossReference, type CrossReferenceEvent } from "@/lib/ghl/crossReference";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";

const MAX_EVENTS = 200;

export async function POST(req: Request) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = sanitizeEvents(payload.events, MAX_EVENTS);
  if (events.length === 0) {
    return NextResponse.json({ data: { byGoogleEventId: {} } });
  }

  try {
    const data = await buildCrossReference(events);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-cross-reference]", describeError(err));
    return NextResponse.json({ error: "Failed to cross-reference" }, { status: 500 });
  }
}

function sanitizeEvents(raw: unknown, max: number): CrossReferenceEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CrossReferenceEvent[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const startTime = typeof obj.startTime === "string" ? obj.startTime : "";
    if (!startTime) continue; // can't compute key without start time
    const endTime = typeof obj.endTime === "string" ? obj.endTime : "";
    const title = typeof obj.title === "string" ? obj.title : "";
    seen.add(id);
    out.push({ id, title, startTime, endTime });
    if (out.length >= max) break;
  }
  return out;
}
