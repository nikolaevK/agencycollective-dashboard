export const dynamic = "force-dynamic";
// A status→closed or paid transition runs best-effort GHL syncs (attendance
// push + CRM funnel: opportunity stage + tags), whose round-trips can take a
// few seconds under rate limiting.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readDeals, findDeal, updateDeal, deleteDeal, sanitizeCcEmails, type DealStatus } from "@/lib/deals";
import { logAuditEvent } from "@/lib/auditLog";
import { setEventAttendance } from "@/lib/eventAttendance";
import { bestEffortPushAttendanceToGhl } from "@/lib/attendanceSync";
import {
  bestEffortSyncShowedDidntClose,
  bestEffortSyncActiveClient,
} from "@/lib/ghlCrmSync";
import { getDealInvoiceStatuses, findDealInvoiceByDealId, updateDealInvoice } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";
import { ensureDealPaperwork } from "@/lib/dealPaperwork";
import { isSetterTier } from "@/lib/appointments";
import { readClosers, findCloser, HOUSE_CLOSER_ID, ensureHouseCloser } from "@/lib/closers";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import { parseDealDraftFields } from "@/lib/dealDraftFields";
import { checkDealDraftReferences } from "@/lib/dealDraftApproval";
import { createAdminDeal } from "@/lib/dealCreation";

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
    readClosers({ includeSystem: true }),
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
    originalCloserName:
      d.originalCloserId && d.originalCloserId !== d.closerId
        ? (closerNameMap.get(d.originalCloserId) ?? null)
        : null,
  }));

  return NextResponse.json({ data: dealsWithStatuses });
}

/**
 * An admin enters a deal directly — no closer login needed. Credited to the
 * closer they pick, or the built-in House closer (lib/closers.ts). Always
 * created CLOSED, so it lands in this queue with its draft invoice (+ a
 * pending contract when there's a client email) to review and send; nothing
 * is emailed here. Body: `{ fields }` — the deal-draft field shape
 * (lib/dealDraftFields.ts, dealValue in CENTS).
 */
export async function POST(request: Request) {
  // Re-checks the `closers` permission against the fresh DB record.
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  const { admin } = guard;

  try {
    const body = await request.json().catch(() => null);
    const raw = body && typeof body === "object" ? (body as Record<string, unknown>).fields : null;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "fields must be an object" }, { status: 400 });
    }
    // Not calendar-linked (no attendance/GHL side effects) and no portal
    // client link; always closed (only closed deals get paperwork to send).
    const parsed = parseDealDraftFields({
      ...(raw as Record<string, unknown>),
      status: "closed",
      googleEventId: null,
      clientUserId: null,
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const fields = parsed.value;

    if (fields.closerId === HOUSE_CLOSER_ID) await ensureHouseCloser();
    // Same bar as every other create path: an ACTIVE closer (not a setter),
    // and setter credit only to an actual setter.
    const check = await checkDealDraftReferences(fields);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    // A fresh admin pick must not credit commission to a deactivated setter
    // (the picker offers active setters only; this covers direct calls).
    // Admin-create only: draft approval can't edit the setter, so the shared
    // check stays as is.
    if (fields.setterId && (await findCloser(fields.setterId))?.status !== "active") {
      return NextResponse.json({ error: "That setter is inactive" }, { status: 400 });
    }

    const created = await createAdminDeal(fields, { id: admin.id });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal.create",
      targetType: "deal",
      targetId: created.deal.id,
      details: JSON.stringify({
        via: "admin",
        clientName: created.deal.clientName,
        closerId: created.deal.closerId,
        house: created.deal.closerId === HOUSE_CLOSER_ID,
        setterId: created.deal.setterId,
        dealValue: created.deal.dealValue,
      }),
    }).catch(() => {});

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error("[admin/deals POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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
      // In-flight statuses hand a deal back to its closer's portal and hide it
      // from this queue — the House closer has no portal, so it'd be orphaned.
      if (deal.closerId === HOUSE_CLOSER_ID && s !== "closed" && s !== "pending_signature") {
        return NextResponse.json(
          { error: "House deals have no closer portal — keep them closed or pending signature, or delete the deal" },
          { status: 400 }
        );
      }
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

    // Admin tier override + no-retainer flag (1099 contract §3.3, §3.8).
    // Admin can null the tier (drops setter from payout entirely) or set a
    // letter — and they can also clear the setter attribution outright by
    // passing setterId: null. Both are audit-logged.
    if (body.setterTier !== undefined) {
      if (body.setterTier === null || body.setterTier === "") {
        changes.setterTier = null;
      } else if (isSetterTier(body.setterTier)) {
        changes.setterTier = body.setterTier;
      } else {
        return NextResponse.json({ error: "Invalid setter tier" }, { status: 400 });
      }
    }
    if (body.noRetainer !== undefined) {
      changes.noRetainer = Boolean(body.noRetainer);
    }
    if (body.setterId !== undefined) {
      changes.setterId = body.setterId ? String(body.setterId).trim() : null;
    }
    // Any admin edit to setter attribution pins the deal: setter-side saves
    // (reassignDealsForEvent) must not revert it. Only stamped when the edit
    // actually diverges from the stored values, so an admin re-saving the
    // unchanged form doesn't needlessly freeze auto-attribution.
    if (
      (changes.setterTier !== undefined && changes.setterTier !== deal.setterTier) ||
      (changes.setterId !== undefined && changes.setterId !== deal.setterId)
    ) {
      changes.setterOverride = true;
    }

    // Auto-show: if changing to closed and deal has a calendar link, mark as showed
    if (changes.status === "closed" && deal.googleEventId && !changes.showStatus) {
      changes.showStatus = "showed";
      await setEventAttendance(deal.googleEventId, deal.closerId, "showed");
      await bestEffortPushAttendanceToGhl({
        googleEventId: deal.googleEventId,
        dashboardStatus: "showed",
      });
      // Advance the GHL lead to "Showed didn't close" (tag + pipeline stage) —
      // unless this same request also marks the deal paid, in which case the
      // "Active Client" promotion below supersedes it (and running both would
      // race GHL's create→search consistency into a duplicate opportunity).
      if (changes.paidStatus !== "paid") {
        await bestEffortSyncShowedDidntClose({
          googleEventId: deal.googleEventId,
          leadName: deal.clientName,
        });
      }
    }

    await updateDeal(id, changes);

    // Paid transition: a linked deal becoming paid promotes the GHL lead to
    // "Active Client" (swaps showed_didnt_close → active_client + moves the
    // opportunity stage). Only fire on the unpaid→paid edge for GHL-linked
    // deals; re-saving an already-paid deal is a no-op.
    if (
      changes.paidStatus === "paid" &&
      deal.paidStatus !== "paid" &&
      deal.googleEventId
    ) {
      await bestEffortSyncActiveClient({
        googleEventId: deal.googleEventId,
        leadName: deal.clientName,
      });
    }

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

    // A transition to closed enters the review queue — backfill the invoice/
    // contract records createDealAction would have generated had the deal
    // been created closed. Also heals older stuck deals: re-saving a closed
    // deal with status "closed" re-runs the (idempotent) backfill.
    if (updated && changes.status === "closed") {
      await ensureDealPaperwork(updated, admin.id);
    }

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
