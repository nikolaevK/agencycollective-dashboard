export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  findDocument,
  updateDocumentMeta,
  deleteDocument,
  isMediaDocType,
  isMediaPlatform,
  normalizeTags,
  type MediaDocType,
  type MediaPlatform,
} from "@/lib/mediaDocuments";
import { normalizeFolderName } from "@/lib/mediaFolders";
import { deleteReadsForDocument } from "@/lib/mediaReads";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:read");
  if (!auth.ok) return auth.response;

  const doc = await findDocument(params.id);
  if (!doc) return fail("not_found", "Document not found", 404);
  return ok(doc);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:write");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findDocument(params.id);
    if (!existing) return fail("not_found", "Document not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: {
      fileName?: string;
      folder?: string;
      docType?: MediaDocType;
      platform?: MediaPlatform | null;
      tags?: string[];
    } = {};
    if (body.fileName !== undefined) {
      // Same sanitization as updateMediaDocumentAction — folder/name grouping
      // downstream assumes no path separators.
      const fileName = String(body.fileName).replace(/[/\\]/g, "-").trim().slice(0, 200);
      if (!fileName) return fail("invalid_request", "Name cannot be empty", 400);
      changes.fileName = fileName;
    }
    if (body.folder !== undefined) {
      changes.folder = normalizeFolderName(String(body.folder)) || "general";
    }
    if (body.docType !== undefined) {
      const docType = String(body.docType);
      if (!isMediaDocType(docType)) return fail("invalid_request", "Invalid document type", 400);
      changes.docType = docType;
    }
    if (body.platform !== undefined) {
      if (body.platform === null || body.platform === "") {
        changes.platform = null;
      } else {
        const platform = String(body.platform);
        if (!isMediaPlatform(platform)) return fail("invalid_request", "Invalid platform", 400);
        changes.platform = platform;
      }
    }
    if (body.tags !== undefined) changes.tags = normalizeTags(body.tags);

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updateDocumentMeta(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "media_document.edit",
      targetType: "media_document",
      targetId: params.id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findDocument(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/media/documents/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Manager-level in the app (`media_manage`) → requires `media:delete`. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findDocument(params.id);
    if (!existing) return fail("not_found", "Document not found", 404);

    await deleteDocument(params.id);
    await deleteReadsForDocument(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "media_document.delete",
      targetType: "media_document",
      targetId: params.id,
      details: JSON.stringify({ fileName: existing.fileName, folder: existing.folder }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/media/documents/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
