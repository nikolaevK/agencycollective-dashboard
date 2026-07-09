export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { findDocument } from "@/lib/mediaDocuments";
import { acknowledgeDocument, unacknowledgeDocument } from "@/lib/mediaReads";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Mark the document as read by this token (idempotent). */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:write");
  if (!auth.ok) return auth.response;

  try {
    const doc = await findDocument(params.id);
    if (!doc) return fail("not_found", "Document not found", 404);

    const actor = tokenAuditActor(auth.token);
    const { newlyAcked } = await acknowledgeDocument(
      params.id,
      actor.adminId,
      actor.adminUsername
    );

    if (newlyAcked) {
      logAuditEvent({
        ...actor,
        action: "media_document.read",
        targetType: "media_document",
        targetId: params.id,
        details: JSON.stringify({ fileName: doc.fileName }),
      }).catch(() => {});
    }

    return ok({ acknowledged: true, newlyAcked });
  } catch (err) {
    console.error("POST /api/v1/media/documents/[id]/acknowledge error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:write");
  if (!auth.ok) return auth.response;

  try {
    const doc = await findDocument(params.id);
    if (!doc) return fail("not_found", "Document not found", 404);

    await unacknowledgeDocument(params.id, tokenAuditActor(auth.token).adminId);
    return ok({ acknowledged: false });
  } catch (err) {
    console.error("DELETE /api/v1/media/documents/[id]/acknowledge error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
