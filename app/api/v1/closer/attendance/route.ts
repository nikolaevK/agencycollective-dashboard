export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { okList, fail, corsPreflight, parsePagination, paginate } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { getAllAttendance } from "@/lib/eventAttendance";

export function OPTIONS() {
  return corsPreflight();
}

/** Latest attendance mark per event, paginated + resource-scoped. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    let attendance = await getAllAttendance();
    const allowed = allowedResourceIds(auth.token, "closer");
    if (allowed) attendance = attendance.filter((a) => allowed.includes(a.closerId));

    const { items, pagination } = paginate(attendance, parsePagination(new URL(request.url)));
    return okList(items, pagination);
  } catch (err) {
    console.error("GET /api/v1/closer/attendance error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
