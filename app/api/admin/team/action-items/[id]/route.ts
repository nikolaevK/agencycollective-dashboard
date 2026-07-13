export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import {
  getActionItem,
  solveActionItem,
  unsolveActionItem,
} from "@/lib/teamActionItems";
import { recordTaskActivity } from "@/lib/teamTasks";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { id: string };
}

/**
 * Flip an action item: { status: 'solved' | 'unsolved' }. Solving completes
 * the linked task; unsolving reopens it (two-way sync, atomic batch).
 * Routed member or privileged.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const existing = await getActionItem(params.id);
  // Not-yours reads as not-found — don't leak other members' item ids.
  if (!existing || !canManageMember(actor, existing.adminId))
    return NextResponse.json({ error: "Action item not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = body.status;
  if (status !== "solved" && status !== "unsolved") {
    return NextResponse.json(
      { error: "status must be 'solved' or 'unsolved'" },
      { status: 400 }
    );
  }

  try {
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
