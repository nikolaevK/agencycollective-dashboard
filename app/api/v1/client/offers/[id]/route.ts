export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { offerDto, offersInternalOnly } from "@/lib/api/offerApi";
import { OfferValidationError, deleteOffer, getOffer, getOfferStats, updateOffer } from "@/lib/portalOffers";
import { normalizeOfferFields } from "@/lib/portalOfferRules";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { id: string };
}

export function OPTIONS() {
  return corsPreflight();
}

/** One catalog service with its lifecycle + engagement totals. */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    const [offer, stats] = await Promise.all([getOffer(params.id), getOfferStats()]);
    if (!offer) return fail("not_found", "Service not found", 404);
    return ok(offerDto(offer, stats.get(offer.id)));
  } catch (err) {
    console.error("GET /api/v1/client/offers/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Partial edit — only the fields sent change. `active: true` publishes (or
 * restores) it for every client, `active: false` retires it; arrays
 * (highlights, links) replace the whole list.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const fields = normalizeOfferFields(await readJsonBody(request), true);
  if (!fields.ok) return fail("invalid_request", fields.error, 400);

  try {
    const offer = await updateOffer(params.id, fields.value);
    if (!offer) return fail("not_found", "Service not found", 404);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.update",
      targetType: "portal_offer",
      targetId: offer.id,
      details: JSON.stringify({ title: offer.title, fields: Object.keys(fields.value) }),
    }).catch(() => {});
    return ok(offerDto(offer, (await getOfferStats()).get(offer.id)));
  } catch (err) {
    if (err instanceof OfferValidationError) return fail("invalid_request", err.message, 400);
    console.error("PATCH /api/v1/client/offers/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Delete for good (its images + view counts go with it; leads keep the title). Retire instead to keep history. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    if (!(await deleteOffer(params.id))) return fail("not_found", "Service not found", 404);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.delete",
      targetType: "portal_offer",
      targetId: params.id,
    }).catch(() => {});
    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/offers/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
