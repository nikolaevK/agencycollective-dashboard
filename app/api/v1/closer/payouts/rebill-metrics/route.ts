export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { getRebillMetrics } from "@/lib/payouts";

export function OPTIONS() {
  return corsPreflight();
}

/** Rebill metrics: ?month&year (default: current). */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const now = new Date();
    const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);
    const year = Number(url.searchParams.get("year") ?? now.getFullYear());
    if (
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2000 || year > 2100
    ) {
      return fail("invalid_request", "Invalid month or year", 400);
    }
    const metrics = await getRebillMetrics(month, year);
    return ok(metrics);
  } catch (err) {
    console.error("GET /api/v1/closer/payouts/rebill-metrics error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
