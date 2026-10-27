export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, readJsonBody, parsePagination, paginate } from "@/lib/api/respond";
import { offerDto, offersInternalOnly } from "@/lib/api/offerApi";
import { OfferValidationError, createOffer, getOfferStats, listOffers } from "@/lib/portalOffers";
import { normalizeOfferFields, offerLifecycle } from "@/lib/portalOfferRules";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

const LIFECYCLES = ["live", "draft", "retired"];

/**
 * The portal cross-sell catalog in display order — drafts and retired
 * services too — each with its lifecycle + engagement totals.
 * Filters: ?status=live|draft|retired, ?category=.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && !LIFECYCLES.includes(status)) {
    return fail("invalid_request", "status must be live, draft or retired", 400);
  }
  const category = url.searchParams.get("category");

  try {
    const [offers, stats] = await Promise.all([listOffers(), getOfferStats()]);
    const rows = offers
      .filter((o) => !status || offerLifecycle(o) === status)
      .filter((o) => !category || o.category.toLowerCase() === category.toLowerCase())
      .map((o) => offerDto(o, stats.get(o.id)));
    const page = paginate(rows, parsePagination(url));
    return okList(page.items, page.pagination);
  } catch (err) {
    console.error("GET /api/v1/client/offers error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Create a service — a hidden draft unless `active: true` (then it's live for every client at once). */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const fields = normalizeOfferFields(await readJsonBody(request), false);
  if (!fields.ok) return fail("invalid_request", fields.error, 400);

  try {
    const offer = await createOffer(fields.value);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.create",
      targetType: "portal_offer",
      targetId: offer.id,
      details: JSON.stringify({ title: offer.title, active: offer.active }),
    }).catch(() => {});
    return ok(offerDto(offer), undefined, { status: 201 });
  } catch (err) {
    if (err instanceof OfferValidationError) return fail("invalid_request", err.message, 400);
    console.error("POST /api/v1/client/offers error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
