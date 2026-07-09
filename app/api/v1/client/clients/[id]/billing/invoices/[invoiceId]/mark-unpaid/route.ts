export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findRebillInvoice, markInvoiceUnpaid } from "@/lib/clientRebillInvoices";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Flag a sent invoice as unpaid: { reason? (≤500) }. 409 if not `sent`. */
export async function POST(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const invoice = await findRebillInvoice(params.invoiceId);
    if (!invoice) return fail("not_found", "Invoice not found", 404);
    if (invoice.userId !== params.id) {
      return fail("invalid_request", "Invoice does not belong to this client", 400);
    }
    if (invoice.status !== "sent") {
      return fail("conflict", "Only a sent invoice can be marked unpaid", 409);
    }

    const body = await readJsonBody(request);
    const reason = body?.reason ? String(body.reason).slice(0, 500) : null;

    const actor = tokenAuditActor(auth.token);
    const updated = await markInvoiceUnpaid(params.invoiceId, actor.adminId, reason);
    if (!updated) {
      return fail("conflict", "Invoice was updated concurrently", 409);
    }

    logAuditEvent({
      ...actor,
      action: "client.invoice_mark_unpaid",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ invoiceId: params.invoiceId, reason }),
    }).catch(() => {});

    const refreshed = await findRebillInvoice(params.invoiceId);
    return ok(refreshed);
  } catch (err) {
    console.error(
      "POST /api/v1/client/clients/[id]/billing/invoices/[invoiceId]/mark-unpaid error:",
      err
    );
    return fail("internal_error", "Internal server error", 500);
  }
}
