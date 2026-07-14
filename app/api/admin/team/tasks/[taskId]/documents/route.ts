export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import { getTask, recordTaskActivity } from "@/lib/teamTasks";
import {
  listTaskDocuments,
  insertTaskDocument,
  MAX_TASK_DOCUMENT_SIZE_BYTES,
} from "@/lib/teamTaskDocuments";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { taskId: string };
}

/** Attachment metadata for one task. Assignee or privileged. */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !canManageMember(actor, task.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const documents = await listTaskDocuments(params.taskId);
  return NextResponse.json({ data: { documents } });
}

/** Attach a PDF (multipart `file`, ≤10 MB). Assignee or privileged. */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !canManageMember(actor, task.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  try {
    const formData = await request.formData().catch(() => null);
    const raw = formData?.get("file");
    if (!(raw instanceof File) || raw.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (raw.size > MAX_TASK_DOCUMENT_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
    }
    const data = Buffer.from(await raw.arrayBuffer());
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ error: "File is not a valid PDF" }, { status: 400 });
    }

    const actorName = actor.admin.displayName?.trim() || actor.admin.username;
    const doc = await insertTaskDocument({
      taskId: params.taskId,
      fileName: raw.name || "document.pdf",
      data,
      uploadedBy: actor.admin.id,
      uploadedByName: actorName,
    });
    recordTaskActivity(
      params.taskId,
      { id: actor.admin.id, name: actorName },
      `Attached ${doc.fileName}`
    ).catch(() => {});
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.task_document_upload",
      targetType: "team_task",
      targetId: params.taskId,
      details: JSON.stringify({ documentId: doc.id, fileName: doc.fileName, size: doc.fileSize }),
    }).catch(() => {});

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (err) {
    console.error("[team] POST task document failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
