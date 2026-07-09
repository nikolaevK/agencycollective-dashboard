export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import {
  findDeal,
  updateDeal,
  deleteDeal,
  sanitizeCcEmails,
  type DealStatus,
} from "@/lib/deals";
import { isSetterTier } from "@/lib/appointments";
import { setEventAttendance } from "@/lib/eventAttendance";
import { findDealInvoiceByDealId, updateDealInvoice } from "@/lib/dealInvoices";
import { logAuditEvent } from "@/lib/auditLog";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: DealStatus[] = [
  "closed",
  "not_closed",
  "pending_signature",
  "rescheduled",
  "follow_up",
];
const MAX_DEAL_VALUE_CENTS = 10_000_000 * 100;

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const deal = await findDeal(params.id);
  if (!deal) return fail("not_found", "Deal not found", 404);
  if (!tokenHasResource(auth.token, "closer", deal.closerId)) {
    return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
  }
  return ok(deal);
}

/**
 * Update a deal (mirrors the admin route's validation; dealValue is integer
 * CENTS in v1). First-party side effects only: auto-show attendance on a
 * closed transition and invoice-email sync are kept; GHL pushes are excluded
 * from v1 by design.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const deal = await findDeal(params.id);
    if (!deal) return fail("not_found", "Deal not found", 404);
    if (!tokenHasResource(auth.token, "closer", deal.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: Parameters<typeof updateDeal>[1] = {};
    if (body.clientName !== undefined) changes.clientName = String(body.clientName).trim();
    if (body.dealValue !== undefined) {
      const dv = Number(body.dealValue);
      if (!Number.isInteger(dv) || dv < 0 || dv > MAX_DEAL_VALUE_CENTS) {
        return fail("invalid_request", "dealValue must be an integer amount in cents", 400);
      }
      changes.dealValue = dv;
    }
    if (body.serviceCategory !== undefined) changes.serviceCategory = body.serviceCategory ? String(body.serviceCategory).trim() : null;
    if (body.industry !== undefined) changes.industry = body.industry ? String(body.industry).trim() : null;
    if (body.closingDate !== undefined) {
      const closingDate = body.closingDate ? String(body.closingDate).trim() : null;
      if (closingDate && !DATE_RE.test(closingDate)) {
        return fail("invalid_request", "closingDate must be yyyy-mm-dd", 400);
      }
      changes.closingDate = closingDate;
    }
    if (body.status !== undefined) {
      const s = String(body.status).trim() as DealStatus;
      if (!VALID_STATUSES.includes(s)) return fail("invalid_request", "Invalid status", 400);
      changes.status = s;
    }
    if (body.notes !== undefined) changes.notes = body.notes ? String(body.notes).trim() : null;
    if (body.clientUserId !== undefined) changes.clientUserId = body.clientUserId ? String(body.clientUserId).trim() : null;
    if (body.clientEmail !== undefined) changes.clientEmail = body.clientEmail ? String(body.clientEmail).trim() : null;
    if (body.paymentType !== undefined) changes.paymentType = String(body.paymentType).trim() || "local";
    if (body.brandName !== undefined) changes.brandName = body.brandName ? String(body.brandName).trim() : null;
    if (body.website !== undefined) changes.website = body.website ? String(body.website).trim() : null;
    if (body.showStatus !== undefined) {
      changes.showStatus =
        body.showStatus === "showed" || body.showStatus === "no_show"
          ? body.showStatus
          : null;
    }
    if (body.paidStatus !== undefined) {
      const ps = String(body.paidStatus).trim();
      if (ps !== "paid" && ps !== "unpaid") return fail("invalid_request", "Invalid paidStatus", 400);
      changes.paidStatus = ps;
    }
    if (body.additionalCcEmails !== undefined) {
      changes.additionalCcEmails = sanitizeCcEmails(body.additionalCcEmails);
    }
    if (body.setterTier !== undefined) {
      if (body.setterTier === null || body.setterTier === "") {
        changes.setterTier = null;
      } else if (isSetterTier(body.setterTier)) {
        changes.setterTier = body.setterTier;
      } else {
        return fail("invalid_request", "Invalid setter tier", 400);
      }
    }
    if (body.noRetainer !== undefined) changes.noRetainer = Boolean(body.noRetainer);
    if (body.setterId !== undefined) {
      changes.setterId = body.setterId ? String(body.setterId).trim() : null;
    }
    // Same pinning rule as the dashboard: an explicit setter edit freezes
    // auto-attribution so setter-side saves can't revert it.
    if (
      (changes.setterTier !== undefined && changes.setterTier !== deal.setterTier) ||
      (changes.setterId !== undefined && changes.setterId !== deal.setterId)
    ) {
      changes.setterOverride = true;
    }

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }

    // Auto-show on a closed transition for calendar-linked deals (first-party
    // attendance write; the GHL push the dashboard does here is out of v1).
    if (changes.status === "closed" && deal.googleEventId && !changes.showStatus) {
      changes.showStatus = "showed";
      await setEventAttendance(deal.googleEventId, deal.closerId, "showed");
    }

    await updateDeal(params.id, changes);

    // Keep the linked invoice's receiver email in sync (first-party).
    if (changes.clientEmail !== undefined) {
      const invoice = await findDealInvoiceByDealId(params.id);
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
      ...tokenAuditActor(auth.token),
      action: "deal.update",
      targetType: "deal",
      targetId: params.id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findDeal(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/closer/deals/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const deal = await findDeal(params.id);
    if (!deal) return fail("not_found", "Deal not found", 404);
    if (!tokenHasResource(auth.token, "closer", deal.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }

    await deleteDeal(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal.delete",
      targetType: "deal",
      targetId: params.id,
      details: JSON.stringify({ clientName: deal.clientName, dealValue: deal.dealValue }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/deals/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
