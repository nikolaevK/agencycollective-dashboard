export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { offersInternalOnly } from "@/lib/api/offerApi";
import { getOfferPage, patchOfferPage, resetOfferPage, type OfferPage } from "@/lib/portalOffers";
import {
  DEFAULT_OFFER_PAGE,
  HIDEABLE_OFFER_PAGE_FIELDS,
  OFFER_PAGE_LIMITS,
  validateOfferPagePatch,
} from "@/lib/portalOfferRules";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Everything an editor needs: live text, the overrides, defaults, what can be hidden, and the caps. */
function pageDto(page: OfferPage) {
  return {
    ...page,
    defaults: DEFAULT_OFFER_PAGE,
    hideable: HIDEABLE_OFFER_PAGE_FIELDS,
    limits: OFFER_PAGE_LIMITS,
  };
}

/**
 * Page design of the portal tab (every word outside the service cards + the
 * header image): `settings` = what clients see, `overrides` = what was
 * changed (null = hidden), `defaults`, `hideable`, `limits`.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    return ok(pageDto(await getOfferPage()));
  } catch (err) {
    console.error("GET /api/v1/client/offers/page error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Change page text — merge semantics: only the fields sent change. A string
 * sets the text ("" = back to the default), null hides a hideable element.
 */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  const patch = validateOfferPagePatch(await readJsonBody(request));
  if (!patch.ok) return fail("invalid_request", patch.error, 400);

  try {
    const page = await patchOfferPage(patch.value);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.page_update",
      targetType: "portal_offers_page",
      details: JSON.stringify({ fields: Object.keys(patch.value) }),
    }).catch(() => {});
    return ok(pageDto(page));
  } catch (err) {
    console.error("PATCH /api/v1/client/offers/page error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Reset every page text to the default and remove the header image — requires `client:delete`. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    const page = await resetOfferPage();
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.page_reset",
      targetType: "portal_offers_page",
    }).catch(() => {});
    return ok(pageDto(page));
  } catch (err) {
    console.error("DELETE /api/v1/client/offers/page error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
