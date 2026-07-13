export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor } from "@/lib/teamAuth";
import {
  getTeamMember,
  setGoalCents,
  isValidGoalMonth,
  listGoalHistory,
} from "@/lib/teamMembers";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { adminId: string };
}

/** Upsert one month's MRR-managed goal: { month: 'yyyy-mm', goalCents }. Privileged only. */
export async function PUT(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.privileged)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  const member = await getTeamMember(params.adminId);
  if (!member)
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const month = typeof body.month === "string" ? body.month.trim() : "";
  if (!isValidGoalMonth(month)) {
    return NextResponse.json({ error: "month must be yyyy-mm" }, { status: 400 });
  }
  const goalCents = Number(body.goalCents);
  if (!Number.isFinite(goalCents) || goalCents < 0) {
    return NextResponse.json(
      { error: "goalCents must be a non-negative integer (cents)" },
      { status: 400 }
    );
  }

  try {
    await setGoalCents(params.adminId, month, goalCents);
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.goal_set",
      targetType: "team_member",
      targetId: params.adminId,
      details: JSON.stringify({ month, goalCents: Math.round(goalCents) }),
    }).catch(() => {});
    const goalHistory = await listGoalHistory(params.adminId);
    return NextResponse.json({ data: { goalHistory } });
  } catch (err) {
    console.error("[team] PUT goal failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
