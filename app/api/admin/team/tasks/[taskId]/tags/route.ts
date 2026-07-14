export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import { getTask, listTaskTags, addTaskTag, recordTaskActivity } from "@/lib/teamTasks";
import { getTeamMember } from "@/lib/teamMembers";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { taskId: string };
}

/** Tagged teammates on one task. Assignee or privileged. */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !canManageMember(actor, task.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const tags = await listTaskTags(params.taskId);
  return NextResponse.json({ data: { tags } });
}

/**
 * Tag a teammate: { adminId }. The task surfaces in their hub's Tagged
 * section. Roster members only (an unrostered admin has no hub to be
 * notified in); tagging the assignee is rejected — it's already their task.
 * Assignee or privileged.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !canManageMember(actor, task.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "";
  const target = adminId ? await getTeamMember(adminId) : null;
  if (!target) {
    return NextResponse.json(
      { error: "adminId must be a Team roster member" },
      { status: 400 }
    );
  }
  if (target.adminId === task.adminId) {
    return NextResponse.json(
      { error: "That member is already the assignee" },
      { status: 400 }
    );
  }

  try {
    const added = await addTaskTag({
      taskId: params.taskId,
      adminId: target.adminId,
      taggedBy: actor.admin.id,
      taggedByName: actor.admin.displayName?.trim() || actor.admin.username,
    });
    // Already tagged = idempotent no-op: no activity, no audit row.
    if (added) {
      recordTaskActivity(
        params.taskId,
        { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
        `Tagged ${target.name}`
      ).catch(() => {});
      logAuditEvent({
        adminId: actor.admin.id,
        adminUsername: actor.admin.username,
        action: "team.task_tag",
        targetType: "team_task",
        targetId: params.taskId,
        details: JSON.stringify({ tagged: target.adminId }),
      }).catch(() => {});
    }
    const tags = await listTaskTags(params.taskId);
    return NextResponse.json({ data: { tags } }, { status: added ? 201 : 200 });
  } catch (err) {
    console.error("[team] POST task tag failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
