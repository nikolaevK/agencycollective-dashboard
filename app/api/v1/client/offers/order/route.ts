export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { offersInternalOnly } from "@/lib/api/offerApi";
import { listOffers, reorderOffers } from "@/lib/portalOffers";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Set the catalog order: { ids } go first, in that order; services not
 * listed follow in their current order. Answers with the full new order.
 */
export async function PUT(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const ids = (await readJsonBody(request))?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id) => typeof id === "string")) {
    return fail("invalid_request", "ids must be a non-empty array of service ids", 400);
  }

  try {
    const known = new Set((await listOffers()).map((o) => o.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) return fail("not_found", `Unknown service id(s): ${unknown.join(", ")}`, 404);

    await reorderOffers(ids);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.reorder",
      targetType: "portal_offer",
    }).catch(() => {});
    return ok({ order: (await listOffers()).map((o) => ({ id: o.id, title: o.title })) });
  } catch (err) {
    console.error("PUT /api/v1/client/offers/order error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
