export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getTask,
  updateTask,
  deleteTask,
  reassignTask,
  listComments,
  listTaskTags,
  addComment,
  addTaskTag,
  parseTaskStatus,
  parseTaskPriority,
  sanitizeChecklist,
  recordTaskActivity,
  TASK_STATUS_LABEL,
  type UpdateTaskInput,
} from "@/lib/teamTasks";
import { syncActionItemForTask } from "@/lib/teamActionItems";
import { listTaskDocuments } from "@/lib/teamTaskDocuments";
import { getTeamMember } from "@/lib/teamMembers";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** One task, with its comments, tagged teammates, and attachment metadata. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const task = await getTask(params.id);
    if (!task) return fail("not_found", "Task not found", 404);
    const [comments, tags, documents] = await Promise.all([
      listComments(params.id),
      listTaskTags(params.id),
      listTaskDocuments(params.id),
    ]);
    return ok({ ...task, comments, tags, documents });
  } catch (err) {
    console.error("GET /api/v1/team/tasks/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Partial update. status=complete solves the linked action item; leaving
 * complete reopens a task-solved item (two-way sync). `reassignTo` transfers
 * the task to another roster member's hub — full ownership, the linked
 * action item moves too (exclusive shape; an optional `comment` alongside it
 * lands on the trail as a handoff note, and `alsoTag` fans the task out to
 * more members as TAGS — ownership stays single). `adminId` in the body stays INERT
 * on update (it's the create-time assignee field, and clients commonly echo
 * whole records back — an echoed adminId must never trigger a transfer).
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

    // Reassign — exclusive shape via the DEDICATED key (never body.adminId,
    // which clients echo back from GETs): full ownership transfer.
    if (body.reassignTo !== undefined) {
      // Only true SWEEP tasks (created_by='system') are locked — a 'system'
      // source label alone (agent-created) stays reassignable.
      if (existing.source === "system" && existing.createdBy === "system") {
        return fail(
          "invalid_request",
          "Sweep-generated tasks can't be reassigned — the sweep routes them per member",
          400
        );
      }
      const toAdminId =
        typeof body.reassignTo === "string" ? body.reassignTo.trim() : "";
      // Roster-validated — an unrostered admin's hub is unreachable in the UI.
      const target = toAdminId ? await getTeamMember(toAdminId) : null;
      if (!target) {
        return fail("invalid_request", "reassignTo must be a Team roster member's admin id", 400);
      }
      // Multi-recipient reassign: ownership stays SINGLE (reassignTo — the
      // board/stats/sync model requires one owner), and every alsoTag member
      // is tagged instead, so the task shows in their hub's Tagged tab.
      // Validated up-front so a bad id fails BEFORE any mutation.
      const alsoTag: { adminId: string; name: string }[] = [];
      if (body.alsoTag !== undefined) {
        if (!Array.isArray(body.alsoTag)) {
          return fail("invalid_request", "alsoTag must be an array of roster member admin ids", 400);
        }
        const ids = [
          ...new Set(
            body.alsoTag
              .filter((v): v is string => typeof v === "string")
              .map((v) => v.trim())
              .filter(Boolean)
          ),
        ].filter((id) => id !== target.adminId); // the new assignee needs no tag
        // One parallel lookup round instead of N serial Turso round-trips.
        const members = await Promise.all(ids.map((id) => getTeamMember(id)));
        for (const member of members) {
          if (!member) {
            return fail("invalid_request", "alsoTag must contain only Team roster members", 400);
          }
          alsoTag.push({ adminId: member.adminId, name: member.name });
        }
      }
      const task = await reassignTask(params.id, target.adminId);
      if (!task) return fail("not_found", "Task not found", 404);
      const actor = tokenAuditActor(auth.token);
      const transferred = task.adminId !== existing.adminId;
      // Same-owner request = idempotent no-op: no activity, no audit row.
      if (transferred) {
        recordTaskActivity(
          task.id,
          { id: actor.adminId, name: actor.adminUsername },
          `Reassigned to ${target.name}`
        ).catch(() => {});
        logAuditEvent({
          ...actor,
          action: "team.task_reassign",
          targetType: "team_task",
          targetId: task.id,
          details: JSON.stringify({ from: existing.adminId, to: task.adminId }),
        }).catch(() => {});
      }
      // Tag the extra recipients AFTER the transfer (the assignee-conflict
      // rule applies to the NEW owner). Applied even on a same-owner no-op —
      // "share with more people" is meaningful without an ownership change.
      // Already-tagged members are idempotent no-ops (no activity/audit).
      let tagged = 0;
      for (const member of alsoTag) {
        const added = await addTaskTag({
          taskId: task.id,
          adminId: member.adminId,
          taggedBy: actor.adminId,
          taggedByName: actor.adminUsername,
        });
        if (added) {
          tagged++;
          recordTaskActivity(
            task.id,
            { id: actor.adminId, name: actor.adminUsername },
            `Tagged ${member.name}`
          ).catch(() => {});
          logAuditEvent({
            ...actor,
            action: "team.task_tag",
            targetType: "team_task",
            targetId: task.id,
            details: JSON.stringify({ tagged: member.adminId }),
          }).catch(() => {});
        }
      }
      // Handoff note — posted whenever the call did something (a transfer OR
      // new tags), so a tags-only share keeps its context. AWAITED: this is
      // user-authored content, and a fire-and-forget write can be dropped
      // when the serverless instance freezes right after the response.
      const note = typeof body.comment === "string" ? body.comment.trim() : "";
      if (note && (transferred || tagged > 0)) {
        try {
          await addComment({
            taskId: task.id,
            adminId: actor.adminId,
            authorName: actor.adminUsername,
            body: note,
          });
        } catch (err) {
          console.error("PATCH /api/v1/team/tasks/[id] reassign comment failed:", err);
        }
      }
      return ok(task);
    }

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
