export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findDeal } from "@/lib/deals";
import { findDealInvoice, updateDealInvoice } from "@/lib/dealInvoices";
import {
  findAdditionalInvoice,
  updateAdditionalInvoice,
} from "@/lib/dealAdditionalInvoices";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Locate the invoice in either the primary or additional table. */
async function locate(id: string) {
  const primary = await findDealInvoice(id);
  if (primary) return { record: primary, additional: false as const };
  const extra = await findAdditionalInvoice(id);
  if (extra) return { record: extra, additional: true as const };
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const found = await locate(params.id);
  if (!found) return fail("not_found", "Invoice not found", 404);

  const deal = await findDeal(found.record.dealId);
  if (deal && !tokenHasResource(auth.token, "closer", deal.closerId)) {
    return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
  }
  return ok({ ...found.record, additional: found.additional });
}

/**
 * Update an invoice record (draft edits / historical registration — never
 * sends email): { invoiceData? (object), status? ("draft"|"sent") }.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const found = await locate(params.id);
    if (!found) return fail("not_found", "Invoice not found", 404);

    const deal = await findDeal(found.record.dealId);
    if (deal && !tokenHasResource(auth.token, "closer", deal.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: { invoiceData?: string; status?: string } = {};
    if (body.invoiceData !== undefined) {
      if (typeof body.invoiceData !== "object" || body.invoiceData === null) {
        return fail("invalid_request", "invoiceData must be an object", 400);
      }
      changes.invoiceData = JSON.stringify(body.invoiceData);
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (status !== "draft" && status !== "sent") {
        return fail("invalid_request", "status must be draft or sent", 400);
      }
      changes.status = status;
    }
    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }

    if (found.additional) {
      await updateAdditionalInvoice(params.id, changes);
    } else {
      await updateDealInvoice(params.id, changes);
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_invoice.update",
      targetType: "deal_invoice",
      targetId: params.id,
      details: JSON.stringify({ fields: Object.keys(changes) }),
    }).catch(() => {});

    const updated = await locate(params.id);
    return ok(updated ? { ...updated.record, additional: updated.additional } : null);
  } catch (err) {
    console.error("PATCH /api/v1/closer/deal-invoices/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
