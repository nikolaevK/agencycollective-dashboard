export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { readDealsByCloser, findDeal, deleteDeal, updateDeal } from "@/lib/deals";
import { setEventAttendance } from "@/lib/eventAttendance";
import { getDealInvoiceStatuses, findDealInvoiceByDealId, updateDealInvoice } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deals = await readDealsByCloser(session.closerId);

  // Attach invoice and contract statuses
  const dealIds = deals.map((d) => d.id);
  const [invoiceStatuses, contractStatuses] = await Promise.all([
    getDealInvoiceStatuses(dealIds),
    getDealContractStatuses(dealIds),
  ]);
  const dealsWithStatuses = deals.map((d) => ({
    ...d,
    invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
    invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
    contractStatus: contractStatuses[d.id]?.status ?? null,
  }));

  return NextResponse.json({ data: dealsWithStatuses });
}

export async function PATCH(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deal = await findDeal(id);
    if (!deal || deal.closerId !== session.closerId) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const changes: Parameters<typeof updateDeal>[1] = {};

    if (body.showStatus !== undefined) {
      const valid = ["showed", "no_show", null];
      if (!valid.includes(body.showStatus)) {
        return NextResponse.json({ error: "Invalid show status" }, { status: 400 });
      }
      changes.showStatus = body.showStatus;
    }

    if (body.clientName !== undefined) changes.clientName = String(body.clientName).trim();
    if (body.dealValue !== undefined) {
      const dv = Number(body.dealValue);
      if (!Number.isFinite(dv) || dv < 0 || dv > 10_000_000) {
        return NextResponse.json({ error: "Invalid deal value" }, { status: 400 });
      }
      changes.dealValue = Math.round(dv * 100);
    }
    if (body.serviceCategory !== undefined) changes.serviceCategory = body.serviceCategory ? String(body.serviceCategory).trim() : null;
    if (body.industry !== undefined) changes.industry = body.industry ? String(body.industry).trim() : null;
    if (body.closingDate !== undefined) changes.closingDate = body.closingDate ? String(body.closingDate).trim() : null;
    if (body.status !== undefined) {
      const s = String(body.status).trim();
      const validStatuses = ["closed", "not_closed", "pending_signature", "rescheduled", "follow_up"];
      if (!validStatuses.includes(s)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      changes.status = s as "closed" | "not_closed" | "pending_signature" | "rescheduled" | "follow_up";
    }
    if (body.notes !== undefined) changes.notes = body.notes ? String(body.notes).trim() : null;
    if (body.clientEmail !== undefined) changes.clientEmail = body.clientEmail ? String(body.clientEmail).trim() : null;
    if (body.paymentType !== undefined) changes.paymentType = String(body.paymentType).trim() || "local";

    // Auto-show: if changing to closed and deal has a calendar link, mark as showed
    if (changes.status === "closed" && deal.googleEventId && !changes.showStatus) {
      changes.showStatus = "showed";
      await setEventAttendance(deal.googleEventId, deal.closerId, "showed");
    }

    await updateDeal(id, changes);

    // Sync email to linked invoice when clientEmail changes
    if (changes.clientEmail !== undefined) {
      const invoice = await findDealInvoiceByDealId(id);
      if (invoice) {
        const invoiceData = invoice.invoiceData;
        invoiceData.receiver.email = changes.clientEmail || "";
        await updateDealInvoice(invoice.id, {
          clientEmail: changes.clientEmail,
          invoiceData: JSON.stringify(invoiceData),
        });
      }
    }

    const updated = await findDeal(id);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[closer/deals PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify the deal belongs to this closer
  const deal = await findDeal(id);
  if (!deal || deal.closerId !== session.closerId) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const deleted = await deleteDeal(id);
  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
