export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import {
  getTask,
  updateTask,
  moveTask,
  deleteTask,
  reassignTask,
  parseTaskStatus,
  parseTaskPriority,
  sanitizeChecklist,
  recordTaskActivity,
  TASK_STATUS_LABEL,
  type UpdateTaskInput,
} from "@/lib/teamTasks";
import { syncActionItemForTask } from "@/lib/teamActionItems";
import { getTeamMember } from "@/lib/teamMembers";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RouteContext {
  params: { taskId: string };
}

/**
 * Update a task. Three shapes:
 * - field updates: { title?, description?, clientId?, status?, priority?,
 *   dueDate?, lineup?, checklist? }
 * - DnD move: { move: { status, afterTaskId: string | null } } — the server
 *   computes the board position (midpoint of neighbors in the target lane).
 * - reassign: { reassignTo: adminId } — FULL ownership transfer to another
 *   hub (linked action item moves too, atomically). The current assignee can
 *   forward their own task; privileged admins can reassign anyone's.
 * A status change syncs the linked action item (complete ⇄ solve).
 * Assignee or privileged.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const existing = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!existing || !canManageMember(actor, existing.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Reassign — exclusive shape: full ownership transfer to another hub.
    if (body.reassignTo !== undefined) {
      // SWEEP-generated tasks are per-member by construction (created +
      // auto-solved per book member, dedup-keyed) — forwarding one would
      // duplicate work in the target's inbox and orphan the dedup pairing.
      // Only the sweep writes created_by='system'; a 'system' SOURCE label
      // alone (e.g. the external agent's api-created items) is provenance
      // styling and stays fully reassignable.
      if (existing.source === "system" && existing.createdBy === "system") {
        return NextResponse.json(
          { error: "Sweep-generated tasks can't be reassigned — the sweep routes them per member" },
          { status: 400 }
        );
      }
      const toAdminId =
        typeof body.reassignTo === "string" ? body.reassignTo.trim() : "";
      // Roster-validated: a task moved to an admin with no team_members row
      // would land in a hub no Team surface can reach (hub URL 404s).
      const target = toAdminId ? await getTeamMember(toAdminId) : null;
      if (!target) {
        return NextResponse.json(
          { error: "reassignTo must be a Team roster member" },
          { status: 400 }
        );
      }
      const task = await reassignTask(params.taskId, target.adminId);
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
      // Same-owner request = idempotent no-op: no activity, no audit row.
      if (task.adminId !== existing.adminId) {
        recordTaskActivity(
          task.id,
          { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
          `Reassigned to ${target.name}`
        ).catch(() => {});
        logAuditEvent({
          adminId: actor.admin.id,
          adminUsername: actor.admin.username,
          action: "team.task_reassign",
          targetType: "team_task",
          targetId: task.id,
          details: JSON.stringify({ from: existing.adminId, to: task.adminId }),
        }).catch(() => {});
      }
      return NextResponse.json({ data: task });
    }

    // DnD move — exclusive shape, handled server-side for ordering integrity.
    if (body.move && typeof body.move === "object") {
      const move = body.move as Record<string, unknown>;
      const status = parseTaskStatus(move.status);
      if (!status) {
        return NextResponse.json(
          { error: "move.status must be todo, in_progress, review, or complete" },
          { status: 400 }
        );
      }
      const afterTaskId =
        typeof move.afterTaskId === "string" && move.afterTaskId
          ? move.afterTaskId
          : null;
      const task = await moveTask(params.taskId, { status, afterTaskId });
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
      if (task.status !== existing.status) {
        await syncActionItemForTask(task.id, task.status);
        recordTaskActivity(
          task.id,
          { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
          `Moved to ${TASK_STATUS_LABEL[task.status]}`
        ).catch(() => {});
      }
      logAuditEvent({
        adminId: actor.admin.id,
        adminUsername: actor.admin.username,
        action: "team.task_update",
        targetType: "team_task",
        targetId: task.id,
        details: JSON.stringify({ move: { from: existing.status, to: task.status } }),
      }).catch(() => {});
      return NextResponse.json({ data: task });
    }

    const changes: UpdateTaskInput = {};
    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      }
      changes.title = title;
    }
    if (typeof body.description === "string") changes.description = body.description;
    if (body.clientId !== undefined) {
      const clientId =
        typeof body.clientId === "string" && body.clientId ? body.clientId : null;
      if (clientId && !(await findUser(clientId))) {
        return NextResponse.json({ error: "Unknown clientId" }, { status: 400 });
      }
      changes.clientId = clientId;
    }
    if (body.status !== undefined) {
      const status = parseTaskStatus(body.status);
      if (!status) {
        return NextResponse.json(
          { error: "status must be todo, in_progress, review, or complete" },
          { status: 400 }
        );
      }
      changes.status = status;
    }
    if (body.priority !== undefined) {
      const priority = parseTaskPriority(body.priority);
      if (!priority) {
        return NextResponse.json(
          { error: "priority must be urgent, high, normal, or low" },
          { status: 400 }
        );
      }
      changes.priority = priority;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate !== null && !(typeof body.dueDate === "string" && YMD_RE.test(body.dueDate))) {
        return NextResponse.json(
          { error: "dueDate must be yyyy-mm-dd or null" },
          { status: 400 }
        );
      }
      changes.dueDate = body.dueDate;
    }
    if (body.lineup !== undefined) changes.lineup = Boolean(body.lineup);
    if (body.checklist !== undefined)
      changes.checklist = sanitizeChecklist(body.checklist);

    const task = await updateTask(params.taskId, changes);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (changes.status !== undefined && task.status !== existing.status) {
      await syncActionItemForTask(task.id, task.status);
      recordTaskActivity(
        task.id,
        { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
        `Moved to ${TASK_STATUS_LABEL[task.status]}`
      ).catch(() => {});
    }

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.task_update",
      targetType: "team_task",
      targetId: task.id,
      details: JSON.stringify(Object.keys(changes)),
    }).catch(() => {});

    return NextResponse.json({ data: task });
  } catch (err) {
    console.error("[team] PATCH task failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Delete a task (+ its comments). Assignee or privileged. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const existing = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!existing || !canManageMember(actor, existing.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  try {
    await deleteTask(params.taskId);
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.task_delete",
      targetType: "team_task",
      targetId: params.taskId,
      details: JSON.stringify({ title: existing.title }),
    }).catch(() => {});
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    console.error("[team] DELETE task failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
