export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCloserSession } from "@/lib/closerSession";
import { insertDeal, sanitizeCcEmails } from "@/lib/deals";
import { ensureMigrated } from "@/lib/db";
import { setEventAttendance } from "@/lib/eventAttendance";
import { resolveSetterForEvent } from "@/lib/setterAttribution";
import { generateInvoiceFromDeal } from "@/lib/dealInvoiceGenerator";
import { insertDealInvoice, generateInvoiceNumber } from "@/lib/dealInvoices";
import { sendPushToAllAdmins } from "@/lib/pushNotifications";

export async function POST(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    if (status !== "not_closed" && dealValue <= 0) {
      return NextResponse.json({ error: "Deal value must be greater than 0" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const setterId = eventId ? await resolveSetterForEvent(eventId) : null;

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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Auto-mark attendance as "showed" when deal is closed
    if (status === "closed" && eventId) {
      await setEventAttendance(eventId, session.closerId, "showed");
    }

    // Auto-generate invoice for closed deals
    if (status === "closed" && dealValue > 0) {
      try {
        const dealValueCents = Math.round(dealValue * 100);
        const invoiceNumber = await generateInvoiceNumber();
        const deal = { id, closerId: session.closerId, setterId, clientName: eventTitle, clientUserId, clientEmail, dealValue: dealValueCents, serviceCategory, industry, closingDate: eventDate, status: status as "closed", showStatus: "showed" as const, notes, googleEventId: eventId || null, paymentType, brandName, website, paidStatus: "unpaid" as const, additionalCcEmails, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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

    // Push notification to admins
    try {
      const dealValueDollars = dealValue;
      await sendPushToAllAdmins({
        title: `New Deal: ${eventTitle}`,
        body: `${status === "closed" ? "Closed" : "New"} deal worth $${dealValueDollars.toLocaleString()} linked from calendar`,
        url: "/dashboard/closers/deals",
        tag: `deal-${id}`,
      });
    } catch (err) {
      console.error("[link-deal] Push failed:", err);
    }

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    console.error("[link-deal] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
