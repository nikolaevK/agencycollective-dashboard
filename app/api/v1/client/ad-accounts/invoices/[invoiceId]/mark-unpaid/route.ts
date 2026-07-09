export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findAdAccountInvoice, markInvoiceUnpaid } from "@/lib/adAccountInvoices";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Flag a sent ad-account invoice as unpaid: { reason? (≤500) }. */
export async function POST(
  request: Request,
  { params }: { params: { invoiceId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const invoice = await findAdAccountInvoice(params.invoiceId);
    if (!invoice) return fail("not_found", "Invoice not found", 404);
    if (!tokenHasResource(auth.token, "client", invoice.userId)) {
      return fail("resource_forbidden", "This token is not allowed to access this client", 403);
    }
    if (invoice.status !== "sent") {
      return fail("conflict", "Only a sent invoice can be marked unpaid", 409);
    }

    const body = await readJsonBody(request);
    const reason = body?.reason ? String(body.reason).slice(0, 500) : null;

    const actor = tokenAuditActor(auth.token);
    const updated = await markInvoiceUnpaid(params.invoiceId, actor.adminId, reason);
    if (!updated) return fail("conflict", "Invoice was updated concurrently", 409);

    logAuditEvent({
      ...actor,
      action: "ad_account.invoice_mark_unpaid",
      targetType: "ad_account",
      targetId: invoice.adAccountId ?? params.invoiceId,
      details: JSON.stringify({ invoiceId: params.invoiceId, reason }),
    }).catch(() => {});

    const refreshed = await findAdAccountInvoice(params.invoiceId);
    return ok(refreshed);
  } catch (err) {
    console.error("POST /api/v1/client/ad-accounts/invoices/[invoiceId]/mark-unpaid error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
