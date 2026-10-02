export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, readJsonBody } from "@/lib/api/respond";
import { allowedResourceIds, tokenHasResource } from "@/lib/apiScopes";
import {
  createDealDraft,
  listDealDrafts,
  countDealDrafts,
  DEAL_DRAFT_REVIEW_STATUSES,
  type DealDraftStatus,
} from "@/lib/dealDrafts";
import { parseDealDraftFields } from "@/lib/dealDraftFields";
import { parseInvoiceSpec, type InvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { checkDealDraftReferences } from "@/lib/dealDraftApproval";
import { notifyDraftAwaitingReview } from "@/lib/draftNotifications";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** List deal drafts. `?status=pending|approved|rejected` (default: all), `?closerId=`. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status");
    if (rawStatus && !DEAL_DRAFT_REVIEW_STATUSES.includes(rawStatus as DealDraftStatus)) {
      return fail("invalid_request", "status must be pending, approved or rejected", 400);
    }
    // Resource scoping + paging in SQL, so a scoped token's older drafts
    // aren't cut off by a pre-filter cap and `total` counts only its own.
    const filter = {
      status: (rawStatus as DealDraftStatus | null) ?? undefined,
      closerId: url.searchParams.get("closerId") ?? undefined,
      closerIds: allowedResourceIds(auth.token, "closer") ?? undefined,
    };
    const page = parsePagination(url);
    const [items, total] = await Promise.all([
      listDealDrafts({ ...filter, ...page }),
      countDealDrafts(filter),
    ]);
    return okList(items, { total, ...page });
  } catch (err) {
    console.error("GET /api/v1/closer/deal-drafts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Propose a deal for human approval. Same fields as createDeal (dealValue in
 * CENTS) plus `invoice` (InvoiceSpec, applied to the deal's generated invoice
 * on approval) and `note` (context for the reviewer). Creates NO deal.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const parsed = parseDealDraftFields(body);
    if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
    const fields = parsed.value;
    if (!tokenHasResource(auth.token, "closer", fields.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    const refs = await checkDealDraftReferences(fields);
    if (!refs.ok) return fail(refs.status === 409 ? "conflict" : "invalid_request", refs.error, refs.status);

    let invoice: InvoiceSpec | null = null;
    if (body.invoice != null) {
      const spec = parseInvoiceSpec(body.invoice);
      if (!spec.ok) return fail("invalid_request", spec.error, 400);
      invoice = spec.value;
    }
    const note = body.note ? String(body.note).trim().slice(0, 2000) || null : null;
    const actor = tokenAuditActor(auth.token);

    const draft = await createDealDraft({
      fields,
      invoice,
      note,
      source: "api",
      createdBy: auth.token.id,
      createdByName: actor.adminUsername,
    });

    logAuditEvent({
      ...actor,
      action: "deal_draft.create",
      targetType: "deal_draft",
      targetId: draft.id,
      details: JSON.stringify({ clientName: fields.clientName, closerId: fields.closerId, dealValue: fields.dealValue }),
    }).catch(() => {});
    await notifyDraftAwaitingReview({
      kind: "deal",
      draftId: draft.id,
      preparedBy: actor.adminUsername,
      amountCents: fields.dealValue,
    });

    return ok(draft, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/deal-drafts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
