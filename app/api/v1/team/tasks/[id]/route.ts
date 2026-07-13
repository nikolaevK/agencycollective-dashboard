export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getTask,
  updateTask,
  deleteTask,
  listComments,
  parseTaskStatus,
  parseTaskPriority,
  sanitizeChecklist,
  recordTaskActivity,
  TASK_STATUS_LABEL,
  type UpdateTaskInput,
} from "@/lib/teamTasks";
import { syncActionItemForTask } from "@/lib/teamActionItems";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** One task, with its comments. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);
    const comments = await listComments(params.id);
    return ok({ ...task, comments });
  } catch (err) {
    console.error("GET /api/v1/team/tasks/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Partial update. status=complete solves the linked action item; leaving
 * complete reopens a task-solved item (two-way sync).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:write");
  if (!auth.ok) return auth.response;

  try {
    const existing = await getTask(params.id);
    if (!existing) return fail("not_found", "Task not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: UpdateTaskInput = {};
    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return fail("invalid_request", "title cannot be empty", 400);
      changes.title = title;
    }
    if (typeof body.description === "string") changes.description = body.description;
    if (body.clientId !== undefined) {
      const clientId =
        typeof body.clientId === "string" && body.clientId ? body.clientId : null;
      if (clientId && !(await findUser(clientId))) {
        return fail("invalid_request", "Unknown clientId", 400);
      }
      changes.clientId = clientId;
    }
    if (body.status !== undefined) {
      const status = parseTaskStatus(body.status);
      if (!status) {
        return fail("invalid_request", "status must be todo, in_progress, review, or complete", 400);
      }
      changes.status = status;
    }
    if (body.priority !== undefined) {
      const priority = parseTaskPriority(body.priority);
      if (!priority) {
        return fail("invalid_request", "priority must be urgent, high, normal, or low", 400);
      }
      changes.priority = priority;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate !== null && !(typeof body.dueDate === "string" && YMD_RE.test(body.dueDate))) {
        return fail("invalid_request", "dueDate must be yyyy-mm-dd or null", 400);
      }
      changes.dueDate = body.dueDate;
    }
    if (body.lineup !== undefined) changes.lineup = Boolean(body.lineup);
    if (body.checklist !== undefined)
      changes.checklist = sanitizeChecklist(body.checklist);

    const task = await updateTask(params.id, changes);
    if (!task) return fail("not_found", "Task not found", 404);

    const actor = tokenAuditActor(auth.token);
    if (changes.status !== undefined && task.status !== existing.status) {
      await syncActionItemForTask(task.id, task.status);
      recordTaskActivity(
        task.id,
        { id: actor.adminId, name: actor.adminUsername },
        `Moved to ${TASK_STATUS_LABEL[task.status]}`
      ).catch(() => {});
    }

    logAuditEvent({
      ...actor,
      action: "team.task_update",
      targetType: "team_task",
      targetId: task.id,
      details: JSON.stringify(Object.keys(changes)),
    }).catch(() => {});

    return ok(task);
  } catch (err) {
    console.error("PATCH /api/v1/team/tasks/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Delete a task (+ its comments). */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await getTask(params.id);
    if (!existing) return fail("not_found", "Task not found", 404);
    await deleteTask(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "team.task_delete",
      targetType: "team_task",
      targetId: params.id,
      details: JSON.stringify({ title: existing.title }),
    }).catch(() => {});

    return ok({ removed: true });
  } catch (err) {
    console.error("DELETE /api/v1/team/tasks/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
