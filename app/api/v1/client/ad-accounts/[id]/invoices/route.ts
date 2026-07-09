export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { getAdAccount } from "@/lib/adAccounts";
import { listInvoicesForAdAccount } from "@/lib/adAccountInvoices";

export function OPTIONS() {
  return corsPreflight();
}

/** Full invoice history for one ad account. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  const account = await getAdAccount(params.id);
  if (!account) return fail("not_found", "Ad account not found", 404);
  if (!tokenHasResource(auth.token, "client", account.userId)) {
    return fail("resource_forbidden", "This token is not allowed to access this client", 403);
  }

  const invoices = await listInvoicesForAdAccount(params.id);
  return ok(invoices);
}
