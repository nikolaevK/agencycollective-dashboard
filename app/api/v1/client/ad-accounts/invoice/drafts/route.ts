export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { getAdAccount } from "@/lib/adAccounts";
import { createInvoiceDraft } from "@/lib/invoiceDrafts";
import { parseInvoiceDraftOptions, parseInvoiceDraftPatch, withoutRecipient } from "@/lib/invoiceDraftInput";
import { parseInvoiceSpec, type InvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { buildAdAccountDraftData, DraftBuildError } from "@/lib/invoiceDraftBuild";
import { notifyDraftAwaitingReview } from "@/lib/draftNotifications";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Prepare an ad-account invoice for a person to review and send. Lines are
 * generated exactly like the dashboard drawer: a retainer line
 * (`retainerCents`, default the account's monthly retainer) and an ad-spend
 * fee line (`spendCents` × `feeBps`, default the account's fee) — each only
 * when > 0. `invoice.items` are EXTRA lines appended after them; the rest of
 * `invoice` (discount, dates, notes) applies as usual. `cycleAnchor`
 * (yyyy-mm-dd) pre-selects a billing cycle other than the next one.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const adAccountId = String(body.adAccountId ?? "").trim();
    if (!adAccountId) return fail("invalid_request", "adAccountId is required", 400);
    const account = await getAdAccount(adAccountId);
    if (!account) return fail("not_found", "Ad account not found", 404);
    if (!tokenHasResource(auth.token, "client", account.userId)) {
      return fail("resource_forbidden", "This token is not allowed to access this client", 403);
    }

    const opts = parseInvoiceDraftOptions({
      retainerCents: body.retainerCents,
      spendCents: body.spendCents,
      feeBps: body.feeBps,
      cycleAnchor: body.cycleAnchor,
    });
    if (!opts.ok) return fail("invalid_request", opts.error, 400);
    const parsed = parseInvoiceDraftPatch(
      { recipientEmail: body.recipientEmail, ccEmails: body.ccEmails, paymentType: body.paymentType, note: body.note },
      { allowInvoiceData: false }
    );
    if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
    let spec: InvoiceSpec | null = null;
    if (body.invoice != null) {
      const r = parseInvoiceSpec(body.invoice);
      if (!r.ok) return fail("invalid_request", r.error, 400);
      spec = r.value;
    }
    const p = parsed.value;
    const paymentType = p.paymentType ?? "local";

    let built;
    try {
      built = await buildAdAccountDraftData({
        account,
        paymentType,
        retainerCents: opts.value.retainerCents,
        spendCents: opts.value.spendCents,
        feeBps: opts.value.feeBps,
        cycleAnchor: opts.value.cycleAnchor ?? null,
        spec,
        recipientEmail: p.recipientEmail ?? null,
      });
    } catch (err) {
      if (err instanceof DraftBuildError) return fail("invalid_request", err.message, 400);
      throw err;
    }

    const actor = tokenAuditActor(auth.token);
    const draft = await createInvoiceDraft({
      kind: "ad_account",
      userId: account.userId,
      adAccountId: account.id,
      invoiceData: built.invoiceData,
      recipientEmail: built.recipientEmail,
      ccEmails: withoutRecipient(p.ccEmails ?? [], built.recipientEmail),
      paymentType,
      options: built.options,
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
      details: JSON.stringify({ kind: "ad_account", adAccountId: account.id, amountCents: draft.amountCents }),
    }).catch(() => {});
    await notifyDraftAwaitingReview({
      kind: "ad_account",
      draftId: draft.id,
      preparedBy: actor.adminUsername,
      amountCents: draft.amountCents,
    });

    return ok(draft, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/ad-accounts/invoice/drafts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
