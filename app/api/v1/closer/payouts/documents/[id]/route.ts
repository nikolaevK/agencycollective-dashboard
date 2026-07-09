export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob } from "@/lib/api/files";
import {
  findDocument,
  findDocumentWithData,
  deleteDocument,
} from "@/lib/payoutDocuments";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Download the stored PDF. `?view=1` inline; `?format=base64` JSON. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const result = await findDocumentWithData(params.id);
    if (!result) return fail("not_found", "Document not found", 404);

    const { doc, fileData } = result;
    return respondBlob(request, {
      fileName: doc.fileName,
      contentType: "application/pdf",
      data: fileData,
    });
  } catch (err) {
    console.error("GET /api/v1/closer/payouts/documents/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findDocument(params.id);
    if (!existing) return fail("not_found", "Document not found", 404);

    await deleteDocument(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "payout_document.delete",
      targetType: "payout_document",
      targetId: params.id,
      details: JSON.stringify({ fileName: existing.fileName, brandName: existing.brandName }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/payouts/documents/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
