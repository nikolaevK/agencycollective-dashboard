export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMemberScoped } from "@/lib/teamAuth";
import {
  listTasks,
  createTask,
  parseTaskStatus,
  parseTaskPriority,
  sanitizeChecklist,
} from "@/lib/teamTasks";
import { clientVisibleToScope } from "@/lib/api/supportScope";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RouteContext {
  params: { adminId: string };
}

/** One member's tasks (filters: status / clientId / search). Self or privileged. */
export async function GET(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageMemberScoped(actor, params.adminId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam ? parseTaskStatus(statusParam) : undefined;
  if (statusParam && !status) {
    return NextResponse.json(
      { error: "status must be todo, in_progress, review, or complete" },
      { status: 400 }
    );
  }
  try {
    const { tasks, total } = await listTasks({
      adminId: params.adminId,
      status: status ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      // Max cap, not the 200 default: the hub board, header chips, and drill
      // panels all derive from this one list — a silent truncation makes them
      // disagree with the SQL-aggregate stats (and drops todo rows first,
      // since listTasks orders 'complete' ahead alphabetically).
      limit: 500,
    });
    return NextResponse.json({ data: { tasks, total } });
  } catch (err) {
    console.error("[team] GET tasks failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Create a task for this member. Self or privileged. */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageMemberScoped(actor, params.adminId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (body.dueDate != null && !(typeof body.dueDate === "string" && YMD_RE.test(body.dueDate))) {
    return NextResponse.json({ error: "dueDate must be yyyy-mm-dd" }, { status: 400 });
  }
  const clientId =
    typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  if (clientId && !(await clientVisibleToScope(actor.scope, clientId))) {
    return NextResponse.json({ error: "Unknown clientId" }, { status: 400 });
  }

  try {
    const task = await createTask({
      adminId: params.adminId,
      title,
      description: typeof body.description === "string" ? body.description : "",
      clientId,
      status: parseTaskStatus(body.status) ?? undefined,
      priority: parseTaskPriority(body.priority) ?? undefined,
      dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
      lineup: Boolean(body.lineup),
      checklist: sanitizeChecklist(body.checklist),
      source: "manual",
      createdBy: actor.admin.id,
      createdByName: actor.admin.displayName?.trim() || actor.admin.username,
    });

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.task_create",
      targetType: "team_task",
      targetId: task.id,
      details: JSON.stringify({ assignee: params.adminId, title: task.title }),
    }).catch(() => {});

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (err) {
    console.error("[team] POST task failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
