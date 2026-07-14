export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { getTask, listTaskTags, addTaskTag, recordTaskActivity } from "@/lib/teamTasks";
import { getTeamMember } from "@/lib/teamMembers";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Tag a teammate on a task: { adminId }. The task surfaces in their hub's
 * Tagged section (their notification surface). Roster members only; tagging
 * the current assignee is rejected. Idempotent — an existing tag is a no-op.
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

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "";
    const target = adminId ? await getTeamMember(adminId) : null;
    if (!target) {
      return fail("invalid_request", "adminId must be a Team roster member's admin id", 400);
    }
    if (target.adminId === task.adminId) {
      return fail("invalid_request", "That member is already the assignee", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const added = await addTaskTag({
      taskId: params.id,
      adminId: target.adminId,
      taggedBy: actor.adminId,
      taggedByName: actor.adminUsername,
    });
    // Already tagged = idempotent no-op: no activity, no audit row.
    if (added) {
      recordTaskActivity(
        params.id,
        { id: actor.adminId, name: actor.adminUsername },
        `Tagged ${target.name}`
      ).catch(() => {});
      logAuditEvent({
        ...actor,
        action: "team.task_tag",
        targetType: "team_task",
        targetId: params.id,
        details: JSON.stringify({ tagged: target.adminId }),
      }).catch(() => {});
    }
    const tags = await listTaskTags(params.id);
    return ok(tags, undefined, { status: added ? 201 : 200 });
  } catch (err) {
    console.error("POST /api/v1/team/tasks/[id]/tags error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
