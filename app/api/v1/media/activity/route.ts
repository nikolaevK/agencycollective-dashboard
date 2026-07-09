export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, corsPreflight } from "@/lib/api/respond";
import { getAuditLogsByTargetPrefix } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Media activity feed (audit entries with target_type media_*). ?limit 1..200. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "media:read");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

  const activity = await getAuditLogsByTargetPrefix("media_", limit);
  return ok(activity);
}
