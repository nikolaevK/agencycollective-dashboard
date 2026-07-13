export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getActionItem,
  solveActionItem,
  unsolveActionItem,
  reassignActionItem,
  deleteActionItem,
} from "@/lib/teamActionItems";
import { recordTaskActivity } from "@/lib/teamTasks";
import { getTeamMember } from "@/lib/teamMembers";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** One action item (with its linked task's id/title/status). */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const item = await getActionItem(params.id);
    if (!item) return fail("not_found", "Action item not found", 404);
    return ok(item);
  } catch (err) {
    console.error("GET /api/v1/team/action-items/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Solve / unsolve: { status } — syncs the linked task atomically. Or
 * reassign: { reassignTo } — full ownership transfer to another roster
 * member's inbox, moving the linked task with it (exclusive shape). Any
 * `adminId` in the body stays INERT (clients echo whole records back).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:write");
  if (!auth.ok) return auth.response;

  try {
    const existing = await getActionItem(params.id);
    if (!existing) return fail("not_found", "Action item not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    // Reassign — exclusive shape via the DEDICATED key (never body.adminId,
    // which clients echo back from GETs): full ownership transfer.
    if (body.reassignTo !== undefined) {
      // dedup_key is the authoritative sweep marker — a 'system' source
      // label alone (agent-created) stays reassignable.
      if (existing.dedupKey != null) {
        return fail(
          "invalid_request",
          "Sweep-generated action items can't be reassigned — the sweep routes them per member",
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
      const item = await reassignActionItem(params.id, target.adminId);
      if (!item) return fail("not_found", "Action item not found", 404);
      // Same-owner request = idempotent no-op: no activity, no audit row.
      if (item.adminId !== existing.adminId) {
        const actor = tokenAuditActor(auth.token);
        if (item.taskId) {
          recordTaskActivity(
            item.taskId,
            { id: actor.adminId, name: actor.adminUsername },
            `Reassigned to ${target.name}`
          ).catch(() => {});
        }
        logAuditEvent({
          ...actor,
          action: "team.action_item_reassign",
          targetType: "team_action_item",
          targetId: item.id,
          details: JSON.stringify({ from: existing.adminId, to: item.adminId, taskId: item.taskId }),
        }).catch(() => {});
      }
      return ok(item);
    }

    const status = body.status;
    if (status !== "solved" && status !== "unsolved") {
      return fail(
        "invalid_request",
        "status must be 'solved' or 'unsolved' (or pass reassignTo to transfer ownership)",
        400
      );
    }

    const actor = tokenAuditActor(auth.token);
    const item =
      status === "solved"
        ? await solveActionItem(params.id, actor.adminId)
        : await unsolveActionItem(params.id);
    if (!item) return fail("not_found", "Action item not found", 404);

    if (item.taskId && existing.status !== item.status) {
      recordTaskActivity(
        item.taskId,
        { id: actor.adminId, name: actor.adminUsername },
        status === "solved" ? "Completed — action item solved" : "Reopened — action item unsolved"
      ).catch(() => {});
    }

    logAuditEvent({
      ...actor,
      action: status === "solved" ? "team.action_item_solve" : "team.action_item_unsolve",
      targetType: "team_action_item",
      targetId: item.id,
      details: JSON.stringify({ taskId: item.taskId }),
    }).catch(() => {});

    return ok(item);
  } catch (err) {
    console.error("PATCH /api/v1/team/action-items/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Delete an action item. The linked task survives. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "team:delete");
  if (!auth.ok) return auth.response;

  try {
    const removed = await deleteActionItem(params.id);
    if (!removed) return fail("not_found", "Action item not found", 404);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "team.action_item_delete",
      targetType: "team_action_item",
      targetId: params.id,
    }).catch(() => {});

    return ok({ removed: true });
  } catch (err) {
    console.error("DELETE /api/v1/team/action-items/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
