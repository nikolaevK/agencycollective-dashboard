export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { okList, fail, corsPreflight, parsePagination } from "@/lib/api/respond";
import { queryAuditLogs } from "@/lib/auditLog";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Read the audit trail (dashboard + API mutations), newest first.
 * Filters: ?action (prefix), ?targetType, ?targetId, ?adminId, ?since,
 * ?until (yyyy-mm-dd, inclusive) — plus standard pagination.
 * API actors appear as adminUsername "api:<token name>".
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "audit:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const sinceRaw = url.searchParams.get("since");
    const untilRaw = url.searchParams.get("until");

    const { entries, total } = await queryAuditLogs({
      action: url.searchParams.get("action")?.trim().slice(0, 100) || undefined,
      targetType: url.searchParams.get("targetType")?.trim().slice(0, 100) || undefined,
      targetId: url.searchParams.get("targetId")?.trim().slice(0, 200) || undefined,
      adminId: url.searchParams.get("adminId")?.trim().slice(0, 200) || undefined,
      since: sinceRaw && DATE_RE.test(sinceRaw) ? sinceRaw : undefined,
      until: untilRaw && DATE_RE.test(untilRaw) ? untilRaw : undefined,
      limit,
      offset,
    });

    return okList(entries, { total, limit, offset });
  } catch (err) {
    console.error("GET /api/v1/audit-log error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
