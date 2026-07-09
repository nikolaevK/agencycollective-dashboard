export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { getTeamMonthlyTrend } from "@/lib/deals";

export function OPTIONS() {
  return corsPreflight();
}

/** Monthly closed/paid revenue trend. ?months 1..36 (default 12). */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  // Team-wide aggregate — a closer-restricted token would see every closer.
  if (allowedResourceIds(auth.token, "closer")) {
    return fail(
      "resource_forbidden",
      "This token is restricted to specific closers and cannot access team-wide aggregates.",
      403
    );
  }

  try {
    const url = new URL(request.url);
    const rawMonths = Number(url.searchParams.get("months"));
    const months =
      Number.isInteger(rawMonths) && rawMonths >= 1 && rawMonths <= 36 ? rawMonths : 12;
    const trend = await getTeamMonthlyTrend(months);
    return ok(trend);
  } catch (err) {
    console.error("GET /api/v1/closer/overview/trend error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
