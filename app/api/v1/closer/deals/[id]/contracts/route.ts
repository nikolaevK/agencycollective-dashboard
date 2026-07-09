export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findDeal } from "@/lib/deals";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findAdditionalContractsByDealId } from "@/lib/dealAdditionalContracts";

export function OPTIONS() {
  return corsPreflight();
}

/** Contract records + statuses for a deal. DocuSeal send/sync excluded. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const deal = await findDeal(params.id);
  if (!deal) return fail("not_found", "Deal not found", 404);
  if (!tokenHasResource(auth.token, "closer", deal.closerId)) {
    return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
  }

  const [primary, additional] = await Promise.all([
    findDealContractByDealId(params.id),
    findAdditionalContractsByDealId(params.id),
  ]);
  return ok({ primary, additional });
}
