export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { getTeamShowRate } from "@/lib/eventAttendance";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** Team show rate + per-closer breakdown. Optional ?since&until window. */
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

    const showRate = await getTeamShowRate({ since, until });
    return ok(showRate);
  } catch (err) {
    console.error("GET /api/v1/closer/attendance/show-rate error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
