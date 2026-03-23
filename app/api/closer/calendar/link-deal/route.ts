export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCloserSession } from "@/lib/closerSession";
import { insertDeal } from "@/lib/deals";
import { ensureMigrated } from "@/lib/db";

export async function POST(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureMigrated();
    const body = await request.json();

    const VALID_STATUSES = ["closed", "not_closed", "pending_signature", "in_progress"];

    const eventId = String(body.eventId ?? "").trim();
    const eventTitle = String(body.eventTitle ?? "").trim();
    const eventDate = String(body.eventDate ?? "").trim() || null;
    const dealValue = Number(body.dealValue ?? 0);
    const serviceCategory = String(body.serviceCategory ?? "").trim() || null;
    const status = String(body.status ?? "closed").trim();
    const notes = String(body.notes ?? "").trim() || null;
    const clientUserId = String(body.clientUserId ?? "").trim() || null;

    if (!eventTitle) {
      return NextResponse.json({ error: "Event title is required" }, { status: 400 });
    }
    if (dealValue <= 0) {
      return NextResponse.json({ error: "Deal value must be greater than 0" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await insertDeal({
      id,
      closerId: session.closerId,
      clientName: eventTitle,
      clientUserId,
      dealValue: Math.round(dealValue * 100), // dollars to cents
      serviceCategory,
      closingDate: eventDate,
      status: status as "closed" | "pending_signature" | "in_progress",
      notes,
      googleEventId: eventId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    console.error("[link-deal] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
