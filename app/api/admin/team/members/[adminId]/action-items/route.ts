export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import {
  listActionItems,
  createActionItem,
  parseActionSourceType,
} from "@/lib/teamActionItems";
import { parseTaskPriority } from "@/lib/teamTasks";
import { clientVisibleToScope } from "@/lib/api/supportScope";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RouteContext {
  params: { adminId: string };
}

/** One member's action-item inbox. Self or privileged. */
export async function GET(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageMember(actor, params.adminId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  if (statusParam && statusParam !== "solved" && statusParam !== "unsolved") {
    return NextResponse.json(
      { error: "status must be 'solved' or 'unsolved'" },
      { status: 400 }
    );
  }
  try {
    const { items, total } = await listActionItems({
      adminId: params.adminId,
      status:
        statusParam === "solved" || statusParam === "unsolved" ? statusParam : undefined,
    });
    return NextResponse.json({ data: { items, total } });
  } catch (err) {
    console.error("[team] GET action items failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Create a dashboard-sourced action item for this member (auto-creates the
 * linked task). Self or privileged.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageMember(actor, params.adminId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (body.sourceType != null && !parseActionSourceType(body.sourceType)) {
    return NextResponse.json(
      { error: "sourceType must be slack, dashboard, or system" },
      { status: 400 }
    );
  }
  if (body.priority != null && !parseTaskPriority(body.priority)) {
    return NextResponse.json(
      { error: "priority must be urgent, high, normal, or low" },
      { status: 400 }
    );
  }
  if (body.dueDate != null && !(typeof body.dueDate === "string" && YMD_RE.test(body.dueDate))) {
    return NextResponse.json({ error: "dueDate must be yyyy-mm-dd" }, { status: 400 });
  }
  const clientId =
    typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  if (clientId && !(await clientVisibleToScope(actor.scope, clientId))) {
    return NextResponse.json({ error: "Unknown clientId" }, { status: 400 });
  }

  const actorName = actor.admin.displayName?.trim() || actor.admin.username;
  try {
    const item = await createActionItem(
      {
        adminId: params.adminId,
        body: text,
        clientId,
        sourceType: parseActionSourceType(body.sourceType) ?? "dashboard",
        sourceChannel:
          typeof body.sourceChannel === "string" ? body.sourceChannel : null,
        authorLabel:
          typeof body.authorLabel === "string" ? body.authorLabel : actorName,
        externalTs: typeof body.externalTs === "string" ? body.externalTs : null,
        taskTitle: typeof body.taskTitle === "string" ? body.taskTitle : null,
        dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
        priority: typeof body.priority === "string" ? body.priority : null,
      },
      { id: actor.admin.id, name: actorName }
    );

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.action_item_create",
      targetType: "team_action_item",
      targetId: item.id,
      details: JSON.stringify({ assignee: params.adminId, taskId: item.taskId }),
    }).catch(() => {});

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (err) {
    console.error("[team] POST action item failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
