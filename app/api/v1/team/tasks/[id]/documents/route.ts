export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readUpload } from "@/lib/api/files";
import { getTask, recordTaskActivity } from "@/lib/teamTasks";
import {
  listTaskDocuments,
  insertTaskDocument,
  MAX_TASK_DOCUMENT_SIZE_BYTES,
} from "@/lib/teamTaskDocuments";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Attachment metadata for one task (bytes via the {documentId} download). */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);
    const documents = await listTaskDocuments(params.id);
    return ok(documents);
  } catch (err) {
    console.error("GET /api/v1/team/tasks/[id]/documents error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Attach a PDF (≤10 MB) — multipart form (`file`) or JSON
 * ({ fileBase64, fileName }).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:write");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);

    const payload = await readUpload(request);
    if (!payload) {
      return fail(
        "invalid_request",
        "Expected multipart/form-data with a `file` field, or JSON with `fileBase64`",
        400
      );
    }
    const file = payload.file;
    if (!file) return fail("invalid_request", "No file provided", 400);
    if (file.buffer.length > MAX_TASK_DOCUMENT_SIZE_BYTES) {
      return fail("payload_too_large", "File too large (max 10 MB)", 413);
    }
    if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return fail("invalid_request", "File is not a valid PDF", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const doc = await insertTaskDocument({
      taskId: params.id,
      fileName: file.name || "document.pdf",
      data: file.buffer,
      uploadedBy: actor.adminId,
      uploadedByName: actor.adminUsername,
    });
    recordTaskActivity(
      params.id,
      { id: actor.adminId, name: actor.adminUsername },
      `Attached ${doc.fileName}`
    ).catch(() => {});
    logAuditEvent({
      ...actor,
      action: "team.task_document_upload",
      targetType: "team_task",
      targetId: params.id,
      details: JSON.stringify({ documentId: doc.id, fileName: doc.fileName, size: doc.fileSize }),
    }).catch(() => {});

    return ok(doc, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/team/tasks/[id]/documents error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
