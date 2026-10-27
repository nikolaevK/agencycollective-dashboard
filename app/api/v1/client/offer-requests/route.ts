export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { allowedResourceIds } from "@/lib/apiScopes";
import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { okList, fail, corsPreflight, parsePagination, paginate } from "@/lib/api/respond";
import { offersInternalOnly } from "@/lib/api/offerApi";
import { listOfferRequests } from "@/lib/portalOffers";
import { OPEN_REQUEST_STATUSES, isOfferRequestStatus } from "@/lib/portalOfferRules";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Leads clients filed from the portal cross-sell tab (Request info / Book a
 * call), newest first: every open lead + the 300 most recent closed ones.
 * Filters: ?status=open|new|contacted|won|lost, ?offerId=, ?clientId=.
 * A client-restricted token only sees its clients' leads.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && status !== "open" && !isOfferRequestStatus(status)) {
    return fail("invalid_request", "status must be open, new, contacted, won or lost", 400);
  }
  const offerId = url.searchParams.get("offerId");
  const clientId = url.searchParams.get("clientId");
  const allowed = allowedResourceIds(auth.token, "client");

  try {
    const rows = (await listOfferRequests()).filter(
      (r) =>
        (!allowed || allowed.includes(r.userId)) &&
        (!status || (status === "open" ? OPEN_REQUEST_STATUSES.includes(r.status) : r.status === status)) &&
        (!offerId || r.offerId === offerId) &&
        (!clientId || r.userId === clientId)
    );
    const page = paginate(rows, parsePagination(url));
    return okList(page.items, page.pagination);
  } catch (err) {
    console.error("GET /api/v1/client/offer-requests error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
