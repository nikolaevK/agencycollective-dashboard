export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { getPayoutPool } from "@/lib/clientDirectory";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** Payout brands with no matching client. Optional ?since&until window. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  // Cross-brand aggregate — a client-restricted token would see revenue for
  // every unmatched brand.
  if (allowedResourceIds(auth.token, "client")) {
    return fail(
      "resource_forbidden",
      "This token is restricted to specific clients and cannot access the cross-brand payout pool.",
      403
    );
  }

  try {
    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get("since");
    const untilRaw = url.searchParams.get("until");
    const pool = await getPayoutPool({
      since: sinceRaw && DATE_RE.test(sinceRaw) ? sinceRaw : null,
      until: untilRaw && DATE_RE.test(untilRaw) ? untilRaw : null,
    });
    return ok(pool);
  } catch (err) {
    console.error("GET /api/v1/client/clients/payout-pool error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
