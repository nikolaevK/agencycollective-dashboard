export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findDeal } from "@/lib/deals";
import { findDealInvoiceByDealId } from "@/lib/dealInvoices";
import { findAdditionalInvoicesByDealId } from "@/lib/dealAdditionalInvoices";

export function OPTIONS() {
  return corsPreflight();
}

/** Invoice records for a deal (primary + additional). No email sending. */
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
    findDealInvoiceByDealId(params.id),
    findAdditionalInvoicesByDealId(params.id),
  ]);
  return ok({ primary, additional });
}
