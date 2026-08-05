export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMemberScoped } from "@/lib/teamAuth";
import { getTask, recordTaskActivity } from "@/lib/teamTasks";
import {
  findTaskDocument,
  findTaskDocumentWithData,
  deleteTaskDocument,
} from "@/lib/teamTaskDocuments";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { taskId: string; docId: string };
}

/** Serve the PDF bytes (`?view=1` for inline). Assignee or privileged. */
export async function GET(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !(await canManageMemberScoped(actor, task.adminId)))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const found = await findTaskDocumentWithData(params.docId);
  if (!found || found.doc.taskId !== params.taskId)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const inline = new URL(request.url).searchParams.get("view") === "1";
  const encodedName = encodeURIComponent(found.doc.fileName).replace(/['()]/g, escape);
  return new NextResponse(new Uint8Array(found.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(found.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Remove an attachment. Assignee or privileged. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !(await canManageMemberScoped(actor, task.adminId)))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  try {
    // Metadata-only lookup — no reason to pull the BLOB just to delete it.
    const doc = await findTaskDocument(params.docId);
    if (!doc || doc.taskId !== params.taskId)
      return NextResponse.json({ error: "Document not found" }, { status: 404 });

    await deleteTaskDocument(params.docId);
    recordTaskActivity(
      params.taskId,
      { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
      `Removed attachment ${doc.fileName}`
    ).catch(() => {});
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.task_document_delete",
      targetType: "team_task",
      targetId: params.taskId,
      details: JSON.stringify({ documentId: params.docId, fileName: doc.fileName }),
    }).catch(() => {});
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    console.error("[team] DELETE task document failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
