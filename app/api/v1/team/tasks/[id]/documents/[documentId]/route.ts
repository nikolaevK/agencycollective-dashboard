export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob } from "@/lib/api/files";
import { getTask, recordTaskActivity } from "@/lib/teamTasks";
import {
  findTaskDocument,
  findTaskDocumentWithData,
  deleteTaskDocument,
} from "@/lib/teamTaskDocuments";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Download the PDF bytes (`?format=base64` for the JSON form). */
export async function GET(
  request: Request,
  { params }: { params: { id: string; documentId: string } }
) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);
    const found = await findTaskDocumentWithData(params.documentId);
    if (!found || found.doc.taskId !== params.id) {
      return fail("not_found", "Document not found", 404);
    }
    return respondBlob(request, {
      fileName: found.doc.fileName,
      contentType: "application/pdf",
      data: found.data,
    });
  } catch (err) {
    console.error("GET /api/v1/team/tasks/[id]/documents/[documentId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Remove an attachment. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; documentId: string } }
) {
  const auth = await authenticateApiRequest(request, "team:delete");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);
    // Metadata-only lookup — no reason to pull the BLOB just to delete it.
    const doc = await findTaskDocument(params.documentId);
    if (!doc || doc.taskId !== params.id) {
      return fail("not_found", "Document not found", 404);
    }
    await deleteTaskDocument(params.documentId);

    const actor = tokenAuditActor(auth.token);
    recordTaskActivity(
      params.id,
      { id: actor.adminId, name: actor.adminUsername },
      `Removed attachment ${doc.fileName}`
    ).catch(() => {});
    logAuditEvent({
      ...actor,
      action: "team.task_document_delete",
      targetType: "team_task",
      targetId: params.id,
      details: JSON.stringify({ documentId: params.documentId, fileName: doc.fileName }),
    }).catch(() => {});

    return ok({ removed: true });
  } catch (err) {
    console.error("DELETE /api/v1/team/tasks/[id]/documents/[documentId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
