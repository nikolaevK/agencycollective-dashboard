export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { tokenHasResource } from "@/lib/apiScopes";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { offersInternalOnly } from "@/lib/api/offerApi";
import { OfferRequestConflictError, getOfferRequest, updateOfferRequest } from "@/lib/portalOffers";
import { OFFER_LIMITS, isOfferRequestStatus, type OfferRequestStatus } from "@/lib/portalOfferRules";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Work a lead: { status?: new|contacted|won|lost, note?: string|null }.
 * Reopening one while the client has another open request for the same
 * service → 409. Nothing is sent to the client.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body) return fail("invalid_request", "Invalid JSON body", 400);
  if (body.status !== undefined && !isOfferRequestStatus(body.status)) {
    return fail("invalid_request", "status must be new, contacted, won or lost", 400);
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return fail("invalid_request", "note must be a string or null", 400);
  }
  if (typeof body.note === "string" && body.note.trim().length > OFFER_LIMITS.message) {
    return fail("invalid_request", `note is too long (max ${OFFER_LIMITS.message} characters)`, 400);
  }
  if (body.status === undefined && body.note === undefined) {
    return fail("invalid_request", "Send status and/or note", 400);
  }

  try {
    const lead = await getOfferRequest(params.id);
    if (!lead) return fail("not_found", "Request not found", 404);
    if (!tokenHasResource(auth.token, "client", lead.userId)) {
      return fail("resource_forbidden", "This token is not allowed to access this client.", 403);
    }

    const changes = {
      status: body.status as OfferRequestStatus | undefined,
      note: body.note === undefined ? undefined : (body.note as string | null)?.trim() || null,
    };
    const actor = tokenAuditActor(auth.token);
    await updateOfferRequest(lead.id, changes, actor.adminUsername);
    logAuditEvent({
      ...actor,
      action: "client.offer_request_update",
      targetType: "client",
      targetId: lead.userId,
      details: JSON.stringify({ requestId: lead.id, offer: lead.offerTitle, from: lead.status, ...changes }),
    }).catch(() => {});
    return ok(await getOfferRequest(lead.id));
  } catch (err) {
    if (err instanceof OfferRequestConflictError) return fail("conflict", err.message, 409);
    console.error("PATCH /api/v1/client/offer-requests/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
