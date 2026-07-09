export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findDocument, setDocumentImportant } from "@/lib/mediaDocuments";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Manager-level in the app (`media_manage`) → requires `media:delete`. */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:delete");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body || typeof body.important !== "boolean") {
      return fail("invalid_request", "Body must be { important: boolean }", 400);
    }

    const existing = await findDocument(params.id);
    if (!existing) return fail("not_found", "Document not found", 404);

    await setDocumentImportant(params.id, body.important);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "media_document.important",
      targetType: "media_document",
      targetId: params.id,
      details: JSON.stringify({ important: body.important }),
    }).catch(() => {});

    const updated = await findDocument(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/media/documents/[id]/important error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
