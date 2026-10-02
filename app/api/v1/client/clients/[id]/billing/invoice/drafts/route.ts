export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { createInvoiceDraft } from "@/lib/invoiceDrafts";
import { parseInvoiceDraftPatch, withoutRecipient } from "@/lib/invoiceDraftInput";
import { parseInvoiceSpec, type InvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { buildClientRebillDraftData } from "@/lib/invoiceDraftBuild";
import { notifyDraftAwaitingReview } from "@/lib/draftNotifications";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Prepare a re-bill invoice for a person to review and send. Starts from the
 * same prefill as the dashboard drawer (agency sender, payment block, the
 * client's MRR line); `invoice` (InvoiceSpec, CENTS) overrides lines /
 * discount / dates / notes. Nothing is emailed, filed or recorded until a
 * person sends it from the client's Billing tab.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    if (body.options !== undefined) return fail("invalid_request", "options only apply to ad-account drafts", 400);
    const parsed = parseInvoiceDraftPatch(body, { allowInvoiceData: false });
    if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
    let spec: InvoiceSpec | null = null;
    if (body.invoice != null) {
      const r = parseInvoiceSpec(body.invoice);
      if (!r.ok) return fail("invalid_request", r.error, 400);
      spec = r.value;
    }
    const p = parsed.value;
    const paymentType = p.paymentType ?? "local";

    const built = await buildClientRebillDraftData({
      userId: params.id,
      paymentType,
      spec,
      recipientEmail: p.recipientEmail ?? null,
    });
    if (!built) return fail("not_found", "Client not found", 404);

    const actor = tokenAuditActor(auth.token);
    const draft = await createInvoiceDraft({
      kind: "client_rebill",
      userId: params.id,
      adAccountId: null,
      invoiceData: built.invoiceData,
      recipientEmail: built.recipientEmail,
      ccEmails: withoutRecipient(p.ccEmails ?? [], built.recipientEmail),
      paymentType,
      options: {},
      note: p.note ?? null,
      source: "api",
      createdBy: auth.token.id,
      createdByName: actor.adminUsername,
    });

    logAuditEvent({
      ...actor,
      action: "invoice_draft.create",
      targetType: "invoice_draft",
      targetId: draft.id,
      details: JSON.stringify({ kind: "client_rebill", userId: params.id, amountCents: draft.amountCents }),
    }).catch(() => {});
    await notifyDraftAwaitingReview({
      kind: "client_rebill",
      draftId: draft.id,
      preparedBy: actor.adminUsername,
      amountCents: draft.amountCents,
    });

    return ok(draft, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients/[id]/billing/invoice/drafts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
