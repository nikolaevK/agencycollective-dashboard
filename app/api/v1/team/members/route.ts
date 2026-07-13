export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { buildTeamDirectory, parseTimeframe } from "@/lib/teamHub";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Team roster with live rollups (clients, MRR managed vs goal, health,
 * rebills, task stats, unsolved action items) plus whole-book totals.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const timeframe = parseTimeframe(url.searchParams.get("timeframe"));
    const directory = await buildTeamDirectory(timeframe);
    return ok({
      timeframe: directory.timeframe,
      today: directory.today,
      window: directory.window,
      members: directory.members,
      totals: directory.totals,
      unrostered: directory.unrostered,
    });
  } catch (err) {
    console.error("GET /api/v1/team/members error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
