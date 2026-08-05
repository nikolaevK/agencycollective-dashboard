export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMemberScoped } from "@/lib/teamAuth";
import {
  getActionItem,
  solveActionItem,
  unsolveActionItem,
  reassignActionItem,
} from "@/lib/teamActionItems";
import { recordTaskActivity } from "@/lib/teamTasks";
import { getTeamMember } from "@/lib/teamMembers";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { id: string };
}

/**
 * Update an action item. Two shapes:
 * - flip: { status: 'solved' | 'unsolved' } — solving completes the linked
 *   task; unsolving reopens it (two-way sync, atomic batch).
 * - reassign: { reassignTo: adminId } — FULL ownership transfer to another
 *   member's inbox; the linked task moves too, atomically. The routed member
 *   can forward their own item; privileged admins can reassign anyone's.
 * Routed member or privileged.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const existing = await getActionItem(params.id);
  // Not-yours reads as not-found — don't leak other members' item ids.
  if (!existing || !(await canManageMemberScoped(actor, existing.adminId)))
    return NextResponse.json({ error: "Action item not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    // Reassign — exclusive shape: full ownership transfer to another inbox.
    if (body.reassignTo !== undefined) {
      // SWEEP items are per-member by construction — the dedup_key is the
      // authoritative marker (only the sweep sets it). A 'system' source
      // label alone (agent-created via API) stays fully reassignable.
      if (existing.dedupKey != null) {
        return NextResponse.json(
          { error: "Sweep-generated action items can't be reassigned — the sweep routes them per member" },
          { status: 400 }
        );
      }
      const toAdminId =
        typeof body.reassignTo === "string" ? body.reassignTo.trim() : "";
      // Roster-validated — an unrostered admin's hub is unreachable in the UI.
      const target = toAdminId ? await getTeamMember(toAdminId) : null;
      if (!target) {
        return NextResponse.json(
          { error: "reassignTo must be a Team roster member" },
          { status: 400 }
        );
      }
      const item = await reassignActionItem(params.id, target.adminId);
      if (!item)
        return NextResponse.json({ error: "Action item not found" }, { status: 404 });
      // Same-owner request = idempotent no-op: no activity, no audit row.
      if (item.adminId !== existing.adminId) {
        if (item.taskId) {
          recordTaskActivity(
            item.taskId,
            { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
            `Reassigned to ${target.name}`
          ).catch(() => {});
        }
        logAuditEvent({
          adminId: actor.admin.id,
          adminUsername: actor.admin.username,
          action: "team.action_item_reassign",
          targetType: "team_action_item",
          targetId: item.id,
          details: JSON.stringify({ from: existing.adminId, to: item.adminId, taskId: item.taskId }),
        }).catch(() => {});
      }
      return NextResponse.json({ data: item });
    }

    const status = body.status;
    if (status !== "solved" && status !== "unsolved") {
      return NextResponse.json(
        { error: "status must be 'solved' or 'unsolved' (or pass reassignTo)" },
        { status: 400 }
      );
    }
    const item =
      status === "solved"
        ? await solveActionItem(params.id, actor.admin.id)
        : await unsolveActionItem(params.id);
    if (!item)
      return NextResponse.json({ error: "Action item not found" }, { status: 404 });

    if (item.taskId && existing.status !== item.status) {
      recordTaskActivity(
        item.taskId,
        { id: actor.admin.id, name: actor.admin.displayName?.trim() || actor.admin.username },
        status === "solved" ? "Completed — action item solved" : "Reopened — action item unsolved"
      ).catch(() => {});
    }

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: status === "solved" ? "team.action_item_solve" : "team.action_item_unsolve",
      targetType: "team_action_item",
      targetId: item.id,
      details: JSON.stringify({ taskId: item.taskId }),
    }).catch(() => {});

    return NextResponse.json({ data: item });
  } catch (err) {
    console.error("[team] PATCH action item failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
