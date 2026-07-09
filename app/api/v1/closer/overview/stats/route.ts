export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { getTeamStats, computeCloseRate } from "@/lib/deals";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** Team-wide deal stats. Optional ?since&until (yyyy-mm-dd) window. */
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
    const sinceRaw = url.searchParams.get("since");
    const untilRaw = url.searchParams.get("until");
    const since = sinceRaw && DATE_RE.test(sinceRaw) ? sinceRaw : undefined;
    const until = untilRaw && DATE_RE.test(untilRaw) ? untilRaw : undefined;

    const stats = await getTeamStats({ since, until });
    const closeRate = computeCloseRate(
      stats.window.closedCount,
      stats.window.pendingCount,
      stats.window.inFlightCount
    );
    return ok({ ...stats, closeRate });
  } catch (err) {
    console.error("GET /api/v1/closer/overview/stats error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
