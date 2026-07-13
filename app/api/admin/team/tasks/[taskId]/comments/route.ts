export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import { getTask, listComments, addComment } from "@/lib/teamTasks";

interface RouteContext {
  params: { taskId: string };
}

/** Comments on one task. Assignee or privileged. */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !canManageMember(actor, task.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const comments = await listComments(params.taskId);
  return NextResponse.json({ data: { comments } });
}

/** Add a comment: { body }. Assignee or privileged. */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const task = await getTask(params.taskId);
  // Not-yours reads as not-found — don't leak other members' task ids.
  if (!task || !canManageMember(actor, task.adminId))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  try {
    const comment = await addComment({
      taskId: params.taskId,
      adminId: actor.admin.id,
      authorName: actor.admin.displayName?.trim() || actor.admin.username,
      body: text,
    });
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (err) {
    console.error("[team] POST comment failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
