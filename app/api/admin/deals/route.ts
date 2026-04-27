export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readDeals, findDeal, updateDeal, deleteDeal, sanitizeCcEmails, type DealStatus } from "@/lib/deals";
import { readClosers } from "@/lib/closers";
import { logAuditEvent } from "@/lib/auditLog";
import { setEventAttendance } from "@/lib/eventAttendance";
import { getDealInvoiceStatuses, findDealInvoiceByDealId, updateDealInvoice } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(request.url);
  const closerId = searchParams.get("closerId");
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase();
  // YYYY-MM-DD window bounds used by the admin deals page to load
  // current-month deals first and older deals in a second request.
  const sinceRaw = searchParams.get("since");
  const untilRaw = searchParams.get("until");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const since = sinceRaw && dateRe.test(sinceRaw) ? sinceRaw : undefined;
  const until = untilRaw && dateRe.test(untilRaw) ? untilRaw : undefined;

  let deals = await readDeals({ since, until });

  // Hide in-flight deals from the admin queue. Closers manage them in their
  // own portal; they only land here once they're closed (with a generated
  // invoice for review) or sitting at pending_signature awaiting paperwork.
  // pending_signature stays because the admin tracks DocuSeal signatures.
  const ADMIN_HIDDEN_STATUSES: ReadonlySet<DealStatus> = new Set([
    "rescheduled",
    "follow_up",
    "not_closed",
  ]);
  deals = deals.filter((d) => !ADMIN_HIDDEN_STATUSES.has(d.status));

  if (closerId) {
    deals = deals.filter((d) => d.closerId === closerId);
  }
  if (status && status !== "all") {
    deals = deals.filter((d) => d.status === status);
  }
  if (search) {
    deals = deals.filter((d) =>
      d.clientName.toLowerCase().includes(search)
    );
  }

  // Attach invoice/contract statuses and closer names
  const dealIds = deals.map((d) => d.id);
  const [invoiceStatuses, contractStatuses, closers] = await Promise.all([
    getDealInvoiceStatuses(dealIds),
    getDealContractStatuses(dealIds),
    readClosers(),
  ]);
  // closers list already contains setter-role rows (setters live in the
  // closers table), so one name map covers both closer_id and setter_id.
  const closerNameMap = new Map(closers.map((c) => [c.id, c.displayName]));
  const dealsWithStatuses = deals.map((d) => ({
    ...d,
    invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
    invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
    contractStatus: contractStatuses[d.id]?.status ?? null,
    closerName: closerNameMap.get(d.closerId) ?? null,
    setterName: d.setterId ? (closerNameMap.get(d.setterId) ?? null) : null,
  }));

  return NextResponse.json({ data: dealsWithStatuses });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deal = await findDeal(id);
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const changes: Parameters<typeof updateDeal>[1] = {};

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
    if (body.clientUserId !== undefined) changes.clientUserId = body.clientUserId ? String(body.clientUserId).trim() : null;
    if (body.clientEmail !== undefined) changes.clientEmail = body.clientEmail ? String(body.clientEmail).trim() : null;
    if (body.paymentType !== undefined) changes.paymentType = String(body.paymentType).trim() || "local";
    if (body.brandName !== undefined) changes.brandName = body.brandName ? String(body.brandName).trim() : null;
    if (body.website !== undefined) changes.website = body.website ? String(body.website).trim() : null;
    if (body.showStatus !== undefined) changes.showStatus = body.showStatus ? String(body.showStatus).trim() as "showed" | "no_show" : null;
    if (body.paidStatus !== undefined) {
      const ps = String(body.paidStatus).trim();
      if (ps === "paid" || ps === "unpaid") changes.paidStatus = ps;
    }
    if (body.additionalCcEmails !== undefined) changes.additionalCcEmails = sanitizeCcEmails(body.additionalCcEmails);

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

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal.update",
      targetType: "deal",
      targetId: id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findDeal(id);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[admin/deals PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deal = await findDeal(id);
    const deleted = await deleteDeal(id);
    if (!deleted) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal.delete",
      targetType: "deal",
      targetId: id,
      details: deal ? JSON.stringify({ clientName: deal.clientName, dealValue: deal.dealValue }) : undefined,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/deals DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
