export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { createContactNote, getContactNotes } from "@/lib/ghl/contacts";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";

const NOTE_BODY_MAX = 10_000;

export async function GET(_req: Request, { params }: { params: { contactId: string } }) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notes = await getContactNotes(params.contactId);
    return NextResponse.json({ data: notes });
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-contact-notes]", describeError(err));
    return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { contactId: string } }) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }
  if (body.length > NOTE_BODY_MAX) {
    return NextResponse.json(
      { error: `Note body must be ${NOTE_BODY_MAX} characters or fewer` },
      { status: 400 }
    );
  }

  try {
    const note = await createContactNote(params.contactId, body);
    return NextResponse.json({ data: note }, { status: 201 });
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-contact-notes:create]", describeError(err));
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
