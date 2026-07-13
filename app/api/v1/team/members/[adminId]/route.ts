export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { buildMemberHub, parseTimeframe } from "@/lib/teamHub";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * One member's hub: summary rollup + attributed client slices (rebill facts
 * are null for manually-billed PepAds clients) + goal history.
 */
export async function GET(
  request: Request,
  { params }: { params: { adminId: string } }
) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const timeframe = parseTimeframe(url.searchParams.get("timeframe"));
    const hub = await buildMemberHub(params.adminId, timeframe);
    if (!hub) return fail("not_found", "Team member not found", 404);
    return ok(hub);
  } catch (err) {
    console.error("GET /api/v1/team/members/[adminId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
