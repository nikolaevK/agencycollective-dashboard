export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { getDealDraft, updateDealDraft, deleteDealDraft } from "@/lib/dealDrafts";
import { parseDealDraftFields } from "@/lib/dealDraftFields";
import { parseInvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { buildDealDraftInvoicePreview, checkDealDraftReferences } from "@/lib/dealDraftApproval";
import { logAuditEvent } from "@/lib/auditLog";

interface Ctx {
  params: { id: string };
}

export function OPTIONS() {
  return corsPreflight();
}

/**
 * A deal draft + `invoicePreview` (the invoice approval would generate). Once
 * reviewed: `status` approved → `dealId` is the created deal; rejected →
 * `reviewNote` says why.
 */
export async function GET(request: Request, { params }: Ctx) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return fail("not_found", "Deal draft not found", 404);
    if (!tokenHasResource(auth.token, "closer", draft.fields.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    const invoicePreview =
      draft.status === "pending" ? await buildDealDraftInvoicePreview(draft).catch(() => null) : null;
    return ok({ ...draft, invoicePreview });
  } catch (err) {
    console.error("GET /api/v1/closer/deal-drafts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Revise a PENDING draft: any createDealDraft field, `invoice` (null clears), `note`. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return fail("not_found", "Deal draft not found", 404);
    if (!tokenHasResource(auth.token, "closer", draft.fields.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    if (draft.status !== "pending") return fail("conflict", `Draft is already ${draft.status}`, 409);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const parsed = parseDealDraftFields(body, draft.fields);
    if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
    if (!tokenHasResource(auth.token, "closer", parsed.value.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    const refs = await checkDealDraftReferences(parsed.value);
    if (!refs.ok) return fail(refs.status === 409 ? "conflict" : "invalid_request", refs.error, refs.status);

    const patch: Parameters<typeof updateDealDraft>[1] = { fields: parsed.value };
    if (body.invoice !== undefined) {
      if (body.invoice === null) patch.invoice = null;
      else {
        const spec = parseInvoiceSpec(body.invoice);
        if (!spec.ok) return fail("invalid_request", spec.error, 400);
        patch.invoice = spec.value;
      }
    }
    if (body.note !== undefined) patch.note = body.note ? String(body.note).trim().slice(0, 2000) || null : null;

    const updated = await updateDealDraft(params.id, patch);
    if (!updated) return fail("conflict", "Draft was already reviewed", 409);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_draft.update",
      targetType: "deal_draft",
      targetId: params.id,
      details: JSON.stringify({ keys: Object.keys(body) }),
    }).catch(() => {});
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/closer/deal-drafts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Withdraw a PENDING draft. Reviewed drafts are history and can't be deleted via the API. */
export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return fail("not_found", "Deal draft not found", 404);
    if (!tokenHasResource(auth.token, "closer", draft.fields.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    if (draft.status !== "pending") return fail("conflict", `Draft is already ${draft.status}`, 409);
    const deleted = await deleteDealDraft(params.id, { pendingOnly: true });
    if (!deleted) return fail("conflict", "Draft was already reviewed", 409);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_draft.delete",
      targetType: "deal_draft",
      targetId: params.id,
      details: JSON.stringify({ clientName: draft.fields.clientName }),
    }).catch(() => {});
    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/deal-drafts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
