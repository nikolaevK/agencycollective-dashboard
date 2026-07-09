export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { findCloser } from "@/lib/closers";
import { getCloserDealStats, getCloserChartDeals } from "@/lib/deals";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** Per-closer deal stats + trailing-year chart deals. Optional ?since&until. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read", {
    resource: { kind: "closer", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const closer = await findCloser(params.id);
    if (!closer) return fail("not_found", "Closer not found", 404);

    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get("since");
    const untilRaw = url.searchParams.get("until");
    const since = sinceRaw && DATE_RE.test(sinceRaw) ? sinceRaw : undefined;
    const until = untilRaw && DATE_RE.test(untilRaw) ? untilRaw : undefined;

    const [stats, chartDeals] = await Promise.all([
      getCloserDealStats(params.id, { since, until }),
      getCloserChartDeals(params.id),
    ]);
    return ok({ stats, chartDeals });
  } catch (err) {
    console.error("GET /api/v1/closer/closers/[id]/stats error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
