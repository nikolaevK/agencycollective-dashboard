export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { getTask, addComment } from "@/lib/teamTasks";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Append a comment to a task's trail: { body }. The agent follow-up path —
 * daily "still unsolved, day N" updates land here instead of rewriting the
 * task description. Author is recorded as the API token.
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
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return fail("invalid_request", "body is required", 400);

    const actor = tokenAuditActor(auth.token);
    const comment = await addComment({
      taskId: params.id,
      adminId: actor.adminId,
      authorName: actor.adminUsername,
      body: text,
    });

    logAuditEvent({
      ...actor,
      action: "team.task_comment_create",
      targetType: "team_task",
      targetId: params.id,
      details: JSON.stringify({ commentId: comment.id }),
    }).catch(() => {});

    return ok(comment, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/team/tasks/[id]/comments error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
