export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getSop,
  updateSop,
  deleteSop,
  SopConflictError,
  SopNotFoundError,
} from "@/lib/sop";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "sops:read");
  if (!auth.ok) return auth.response;

  const record = await getSop(params.id);
  if (!record) return fail("not_found", "SOP not found", 404);
  return ok(record);
}

/**
 * Update a SOP: { doc?, folder?, tags?, status?, baseUpdatedAt? }.
 * When baseUpdatedAt is provided and stale → 409 with the current record
 * (mirrors the app's optimistic-concurrency contract exactly).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "sops:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const actor = tokenAuditActor(auth.token);
    const record = await updateSop(
      params.id,
      {
        rawDoc: body.doc,
        folder: body.folder != null ? String(body.folder) : undefined,
        tags: body.tags,
        status: body.status,
      },
      actor.adminId,
      body.baseUpdatedAt !== undefined
        ? body.baseUpdatedAt != null
          ? String(body.baseUpdatedAt)
          : null
        : undefined
    );

    logAuditEvent({
      ...actor,
      action: "sop.update",
      targetType: "sop",
      targetId: params.id,
      details: JSON.stringify({ title: record.title, folder: record.folder }),
    }).catch(() => {});

    return ok(record);
  } catch (err) {
    if (err instanceof SopConflictError) {
      const current = await getSop(params.id);
      return fail("conflict", "SOP was modified by someone else", 409, { data: current });
    }
    if (err instanceof SopNotFoundError) {
      return fail("not_found", "SOP not found", 404);
    }
    console.error("PATCH /api/v1/sops/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "sops:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await getSop(params.id);
    if (!existing) return fail("not_found", "SOP not found", 404);

    await deleteSop(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "sop.delete",
      targetType: "sop",
      targetId: params.id,
      details: JSON.stringify({ title: existing.title }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/sops/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
