export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMemberScoped } from "@/lib/teamAuth";
import { getTask, removeTaskTag, recordTaskActivity } from "@/lib/teamTasks";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { taskId: string; adminId: string };
}

/**
 * Untag a teammate. Assignee or privileged — plus the tagged member
 * themselves may always remove their OWN tag (dismiss from their hub).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  const selfUntag = actor.admin.id === params.adminId;
  const canManage = task ? await canManageMemberScoped(actor, task.adminId) : false;
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || (!canManage && !selfUntag))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  try {
    const removed = await removeTaskTag(params.taskId, params.adminId);
    if (!removed) {
      // A self-untagger who can't manage the task learns nothing extra: an
      // absent tag reads as the same 404 a missing task returns, so the
      // self-untag path can't be used to probe which task ids exist.
      return NextResponse.json(
        { error: canManage ? "Tag not found" : "Task not found" },
        { status: 404 }
      );
    }

    recordTaskActivity(
      params.taskId,
      { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
      selfUntag && !canManage
        ? "Removed their tag"
        : "Removed a tag"
    ).catch(() => {});
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.task_untag",
      targetType: "team_task",
      targetId: params.taskId,
      details: JSON.stringify({ untagged: params.adminId }),
    }).catch(() => {});
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    console.error("[team] DELETE task tag failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
