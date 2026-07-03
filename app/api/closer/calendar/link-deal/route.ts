export const dynamic = "force-dynamic";
// Deal creation triggers a synchronous best-effort GHL push (attendance) plus
// the CRM funnel sync (opportunity stage + tags). With rate limiting those
// round-trips can take a few seconds.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCloserOnlyFromSession } from "@/lib/closerGuards";
import { insertDeal, findDealByCloserAndEvent, sanitizeCcEmails } from "@/lib/deals";
import { ensureMigrated } from "@/lib/db";
import { setEventAttendance } from "@/lib/eventAttendance";
import { bestEffortPushAttendanceToGhl } from "@/lib/attendanceSync";
import { bestEffortSyncShowedDidntClose } from "@/lib/ghlCrmSync";
import { resolveSetterForEvent } from "@/lib/setterAttribution";
import { generateInvoiceFromDeal } from "@/lib/dealInvoiceGenerator";
import { insertDealInvoice, generateInvoiceNumber } from "@/lib/dealInvoices";
import { sendPushToAllAdmins } from "@/lib/pushNotifications";

export async function POST(request: Request) {
  // Closer-only: setters share the c_sess cookie but must not create deals.
  const closer = await getCloserOnlyFromSession();
  if (!closer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = { closerId: closer.id };

  try {
    await ensureMigrated();
    const body = await request.json();

    const VALID_STATUSES = ["closed", "not_closed", "pending_signature", "rescheduled", "follow_up"];

    const eventId = String(body.eventId ?? "").trim();
    const eventTitle = String(body.eventTitle ?? "").trim();
    const eventDate = String(body.eventDate ?? "").trim() || null;
    const dealValue = Number(body.dealValue ?? 0);
    const serviceCategory = String(body.serviceCategory ?? "").trim() || null;
    const industry = String(body.industry ?? "").trim() || null;
    const status = String(body.status ?? "closed").trim();
    const notes = String(body.notes ?? "").trim() || null;
    const clientUserId = String(body.clientUserId ?? "").trim() || null;
    const rawEmail = String(body.clientEmail ?? "").trim();
    const clientEmail = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) && rawEmail.length <= 254 ? rawEmail : null;
    const paymentType = String(body.paymentType ?? "local").trim() || "local";
    const brandName = String(body.brandName ?? "").trim() || null;
    const website = String(body.website ?? "").trim() || null;
    const additionalCcEmails = sanitizeCcEmails(body.additionalCcEmails);

    if (!eventTitle) {
      return NextResponse.json({ error: "Event title is required" }, { status: 400 });
    }
    // Mirror the deals PATCH validation: NaN/Infinity pass a plain `<= 0`
    // check and would persist garbage into revenue SUM/AVG math.
    if (!Number.isFinite(dealValue) || dealValue < 0 || dealValue > 10_000_000) {
      return NextResponse.json({ error: "Invalid deal value" }, { status: 400 });
    }
    if (status !== "not_closed" && dealValue <= 0) {
      return NextResponse.json({ error: "Deal value must be greater than 0" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (eventDate && (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate)))) {
      return NextResponse.json({ error: "Invalid event date" }, { status: 400 });
    }

    // One deal per (closer, event) through this flow — a double-submit or a
    // client retry after a slow GHL round-trip otherwise duplicates the deal
    // and its invoice.
    if (eventId) {
      const existing = await findDealByCloserAndEvent(session.closerId, eventId);
      if (existing) {
        return NextResponse.json(
          { error: "You already have a deal linked to this event." },
          { status: 409 }
        );
      }
    }

    const id = crypto.randomUUID();
    // Setter only attributed when they've picked a tier on the matching
    // appointment claim per the 1099 contract.
    const resolvedSetter = eventId ? await resolveSetterForEvent(eventId) : null;
    const setterId = resolvedSetter?.setterId ?? null;
    const setterTier = resolvedSetter?.tier ?? null;

    await insertDeal({
      id,
      closerId: session.closerId,
      setterId,
      clientName: eventTitle,
      clientUserId,
      clientEmail,
      dealValue: Math.round(dealValue * 100), // dollars to cents
      serviceCategory,
      industry,
      closingDate: eventDate,
      status: status as "closed" | "not_closed" | "pending_signature" | "rescheduled" | "follow_up",
      showStatus: status === "closed" ? "showed" : null,
      notes,
      googleEventId: eventId || null,
      paymentType,
      brandName,
      website,
      paidStatus: "unpaid",
      additionalCcEmails,
      setterTier,
      noRetainer: false,
      setterOverride: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Auto-mark attendance as "showed" when deal is closed. Best-effort and
    // parallel: the deal is already inserted, so a failed attendance/GHL
    // round-trip must not 500 the request (the resulting user retry is what
    // used to create duplicate deals).
    if (status === "closed" && eventId) {
      try {
        await setEventAttendance(eventId, session.closerId, "showed");
      } catch (err) {
        console.error("[link-deal] attendance write failed:", err);
      }
      // We have title + start here (no end), which is enough for sync to
      // hit existing link rows. First-sight composite-key resolution needs
      // end too and will fall back to the drift detector on next read.
      await Promise.allSettled([
        bestEffortPushAttendanceToGhl({
          googleEventId: eventId,
          dashboardStatus: "showed",
          title: eventTitle,
          startTime: eventDate,
        }),
        // Advance the GHL lead to "Showed didn't close" (tag + pipeline stage).
        bestEffortSyncShowedDidntClose({
          googleEventId: eventId,
          title: eventTitle,
          startTime: eventDate,
          leadName: eventTitle,
        }),
      ]);
    }

    // Auto-generate invoice for closed deals
    if (status === "closed" && dealValue > 0) {
      try {
        const dealValueCents = Math.round(dealValue * 100);
        const invoiceNumber = await generateInvoiceNumber();
        const deal = { id, closerId: session.closerId, setterId, clientName: eventTitle, clientUserId, clientEmail, dealValue: dealValueCents, serviceCategory, industry, closingDate: eventDate, status: status as "closed", showStatus: "showed" as const, notes, googleEventId: eventId || null, paymentType, brandName, website, paidStatus: "unpaid" as const, additionalCcEmails, setterTier, noRetainer: false, setterOverride: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const invoiceData = await generateInvoiceFromDeal(deal, clientEmail, invoiceNumber);
        await insertDealInvoice({
          id: crypto.randomUUID(),
          dealId: id,
          invoiceNumber,
          invoiceData: JSON.stringify(invoiceData),
          clientEmail,
          createdBy: session.closerId,
        });
      } catch (err) {
        console.error("[link-deal] Invoice generation failed:", err instanceof Error ? err.message : err);
      }
    }

    // Notify admins only when the deal is closed and lands in their queue.
    // In-flight statuses stay with the closer; pinging admin about a deal
    // they can't see in the queue would just be noise.
    if (status === "closed") {
      try {
        await sendPushToAllAdmins({
          title: `New Deal: ${eventTitle}`,
          body: `Closed deal worth $${dealValue.toLocaleString()} linked from calendar`,
          url: "/dashboard/closers/deals",
          tag: `deal-${id}`,
        });
      } catch (err) {
        console.error("[link-deal] Push failed:", err);
      }
    }

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    console.error("[link-deal] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
