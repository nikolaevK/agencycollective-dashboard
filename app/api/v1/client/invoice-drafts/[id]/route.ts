export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { loadInvoiceDraftForToken } from "@/lib/api/invoiceDraftApi";
import { updateInvoiceDraft, deleteInvoiceDraft, invoiceDraftConflictMessage } from "@/lib/invoiceDrafts";
import { parseInvoiceDraftPatch, withoutRecipient } from "@/lib/invoiceDraftInput";
import { applyInvoiceSpec, parseInvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { applyAdAccountSpec } from "@/lib/invoiceDraftBuild";
import { logAuditEvent } from "@/lib/auditLog";

interface Ctx {
  params: { id: string };
}

export function OPTIONS() {
  return corsPreflight();
}

function denied(status: 403 | 404) {
  return status === 404
    ? fail("not_found", "Invoice draft not found", 404)
    : fail("resource_forbidden", "This token is not allowed to access this client", 403);
}

/** A person saved this draft in the dashboard — the API can read it, not rewrite or withdraw it. */
function dashboardOwned() {
  return fail("resource_forbidden", "This draft was saved in the dashboard and can only be changed there", 403);
}

/**
 * One invoice draft, including the full invoiceData. After review: `status`
 * sent → `sentInvoiceId` is the client/ad-account invoice record; rejected →
 * `reviewNote` says why.
 */
export async function GET(request: Request, { params }: Ctx) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  try {
    const found = await loadInvoiceDraftForToken(auth.token, params.id);
    if (!found.ok) return denied(found.status);
    return ok({ ...found.draft, clientName: found.target.clientName, accountName: found.target.accountName });
  } catch (err) {
    console.error("GET /api/v1/client/invoice-drafts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Revise a PENDING draft: `invoice` (InvoiceSpec applied over the current
 * draft — for ad-account drafts its items replace the EXTRA lines, never the
 * generated retainer / fee lines), `recipientEmail`, `ccEmails`, `note`.
 * paymentType and the ad-account components can't change here — delete and
 * recreate the draft instead.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  try {
    const found = await loadInvoiceDraftForToken(auth.token, params.id);
    if (!found.ok) return denied(found.status);
    const { draft } = found;
    if (draft.status !== "pending") return fail("conflict", `Draft is already ${draft.status}`, 409);
    if (draft.source !== "api") return dashboardOwned();

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    if (body.paymentType !== undefined || body.options !== undefined) {
      return fail(
        "invalid_request",
        "paymentType and ad-account components can't be changed — delete and recreate the draft",
        400
      );
    }
    const parsed = parseInvoiceDraftPatch(body, { allowInvoiceData: false });
    if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
    const patch = parsed.value;

    let data = draft.invoiceData;
    if (body.invoice !== undefined && body.invoice !== null) {
      const spec = parseInvoiceSpec(body.invoice);
      if (!spec.ok) return fail("invalid_request", spec.error, 400);
      data =
        draft.kind === "ad_account"
          ? applyAdAccountSpec(data, spec.value, draft.options.lineIds)
          : applyInvoiceSpec(data, spec.value);
      if (data.details.items.length === 0) return fail("invalid_request", "The invoice must keep at least one line", 400);
    }
    if (patch.recipientEmail !== undefined) {
      data = { ...data, receiver: { ...data.receiver, email: patch.recipientEmail ?? "" } };
    }
    if (data !== draft.invoiceData) patch.invoiceData = data;
    if (patch.ccEmails || patch.recipientEmail !== undefined) {
      patch.ccEmails = withoutRecipient(
        patch.ccEmails ?? draft.ccEmails,
        patch.recipientEmail !== undefined ? patch.recipientEmail : draft.recipientEmail
      );
    }

    const updated = await updateInvoiceDraft(params.id, patch);
    if (!updated) return fail("conflict", await invoiceDraftConflictMessage(params.id), 409);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "invoice_draft.update",
      targetType: "invoice_draft",
      targetId: params.id,
      details: JSON.stringify({ keys: Object.keys(body), amountCents: updated.amountCents }),
    }).catch(() => {});
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/client/invoice-drafts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Withdraw a PENDING draft. Reviewed drafts are history and can't be deleted via the API. */
export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;
  try {
    const found = await loadInvoiceDraftForToken(auth.token, params.id);
    if (!found.ok) return denied(found.status);
    if (found.draft.status !== "pending") return fail("conflict", `Draft is already ${found.draft.status}`, 409);
    if (found.draft.source !== "api") return dashboardOwned();
    const deleted = await deleteInvoiceDraft(params.id, { pendingOnly: true });
    if (!deleted) return fail("conflict", await invoiceDraftConflictMessage(params.id), 409);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "invoice_draft.delete",
      targetType: "invoice_draft",
      targetId: params.id,
      details: JSON.stringify({ kind: found.draft.kind }),
    }).catch(() => {});
    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/invoice-drafts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
