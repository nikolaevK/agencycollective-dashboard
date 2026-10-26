export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { okList, fail, corsPreflight, parsePagination } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { listDealPreps } from "@/lib/dealPrep";
import { isDealPrepStatus } from "@/lib/dealPrepRules";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Deal-prep queue: ?status=queued|dispatched|ready|needs_input|failed|stale|sent.
 * A scheduled agent run polls status=queued (and failed) to pick up deals a
 * per-deal trigger missed. Resource-scoped to the token's allowed closers.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  if (statusRaw && !isDealPrepStatus(statusRaw)) {
    return fail("invalid_request", "Unknown status", 400);
  }
  const page = parsePagination(url);
  const { items, total } = await listDealPreps({
    status: statusRaw && isDealPrepStatus(statusRaw) ? statusRaw : undefined,
    closerIds: allowedResourceIds(auth.token, "closer"),
    ...page,
  });
  return okList(items, { total, limit: page.limit, offset: page.offset });
}
