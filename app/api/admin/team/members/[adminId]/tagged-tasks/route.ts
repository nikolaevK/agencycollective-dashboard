export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMemberScoped } from "@/lib/teamAuth";
import { listTaggedTasks } from "@/lib/teamTasks";

interface RouteContext {
  params: { adminId: string };
}

/**
 * Tasks this member is tagged on (any owner) — feeds the hub's Tagged
 * section, their notification surface. Self or privileged.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageMemberScoped(actor, params.adminId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  try {
    const tasks = await listTaggedTasks(params.adminId);
    return NextResponse.json({ data: { tasks } });
  } catch (err) {
    console.error("[team] GET tagged tasks failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
