export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, paginate, readJsonBody } from "@/lib/api/respond";
import { listSops, createSop } from "@/lib/sop";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** List SOPs. Filters: ?folder&tag, paginated. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "sops:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder") ?? undefined;
    const tag = url.searchParams.get("tag") ?? undefined;
    const sops = await listSops({ folder, tag });
    const { items, pagination } = paginate(sops, parsePagination(url));
    return okList(items, pagination);
  } catch (err) {
    console.error("GET /api/v1/sops error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Create a SOP: { doc, folder?, tags?, status? }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "sops:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body || body.doc === undefined) {
      return fail("invalid_request", "Body must include `doc`", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const record = await createSop(
      {
        rawDoc: body.doc,
        folder: body.folder != null ? String(body.folder) : undefined,
        tags: body.tags,
        status: body.status,
      },
      actor.adminId
    );

    logAuditEvent({
      ...actor,
      action: "sop.create",
      targetType: "sop",
      targetId: record.id,
      details: JSON.stringify({ title: record.title, folder: record.folder }),
    }).catch(() => {});

    return ok(record, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/sops error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
