export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { listActiveSentInvoices } from "@/lib/adAccountInvoices";

export function OPTIONS() {
  return corsPreflight();
}

/** All ad-account invoices currently awaiting payment. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    let invoices = await listActiveSentInvoices();
    const allowed = allowedResourceIds(auth.token, "client");
    if (allowed) {
      // A resource-restricted token sees only its clients' invoices. Free /
      // unattached-account invoices (no client) are NOT in its grant — they
      // used to leak to every restricted token (number, amount, recipient),
      // unlike the single-item routes, which 403 them.
      invoices = invoices.filter((i) => i.userId != null && allowed.includes(i.userId));
    }
    return ok(invoices);
  } catch (err) {
    console.error("GET /api/v1/client/ad-accounts/sent-invoices error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
