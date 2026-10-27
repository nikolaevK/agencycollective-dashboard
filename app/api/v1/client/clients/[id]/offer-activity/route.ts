export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { offersInternalOnly } from "@/lib/api/offerApi";
import { getClientOfferActivity } from "@/lib/portalOffers";
import { findUser } from "@/lib/users";

export function OPTIONS() {
  return corsPreflight();
}

/** Which cross-sell services this client opened in their portal (views, link clicks) and what they asked for. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    if (!(await findUser(params.id))) return fail("not_found", "Client not found", 404);
    return ok(await getClientOfferActivity(params.id));
  } catch (err) {
    console.error("GET /api/v1/client/clients/[id]/offer-activity error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
