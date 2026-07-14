export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { getTask, removeTaskTag, recordTaskActivity } from "@/lib/teamTasks";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Untag a teammate — the task leaves their hub's Tagged section. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; adminId: string } }
) {
  const auth = await authenticateApiRequest(request, "team:delete");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);
    const removed = await removeTaskTag(params.id, params.adminId);
    if (!removed) return fail("not_found", "Tag not found", 404);

    const actor = tokenAuditActor(auth.token);
    recordTaskActivity(
      params.id,
      { id: actor.adminId, name: actor.adminUsername },
      "Removed a tag"
    ).catch(() => {});
    logAuditEvent({
      ...actor,
      action: "team.task_untag",
      targetType: "team_task",
      targetId: params.id,
      details: JSON.stringify({ untagged: params.adminId }),
    }).catch(() => {});

    return ok({ removed: true });
  } catch (err) {
    console.error("DELETE /api/v1/team/tasks/[id]/tags/[adminId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
