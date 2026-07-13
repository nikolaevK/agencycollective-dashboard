export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findAdmin } from "@/lib/admins";
import { getTeamActor } from "@/lib/teamAuth";
import {
  createTeamMember,
  setGoalCents,
  isValidGoalMonth,
  parseAttribution,
  DuplicateTeamMemberError,
} from "@/lib/teamMembers";
import { businessTodayYmd } from "@/lib/businessTime";
import { logAuditEvent } from "@/lib/auditLog";

/** Add an admin to the Team roster. Privileged only. */
export async function POST(request: Request) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.privileged)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "";
  if (!adminId) {
    return NextResponse.json({ error: "adminId is required" }, { status: 400 });
  }
  const target = await findAdmin(adminId);
  if (!target) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  const attribution = parseAttribution(body.attribution ?? "lead");
  if (!attribution) {
    return NextResponse.json(
      { error: "attribution must be book, lead, media_buyer, or csm" },
      { status: 400 }
    );
  }

  if (
    body.splitSharePercent !== undefined &&
    body.splitSharePercent !== null &&
    !(typeof body.splitSharePercent === "number" && body.splitSharePercent >= 0 && body.splitSharePercent <= 100)
  ) {
    return NextResponse.json(
      { error: "splitSharePercent must be 0-100 or null" },
      { status: 400 }
    );
  }

  try {
    const member = await createTeamMember(adminId, {
      position: typeof body.position === "string" ? body.position : "",
      attribution,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      splitSharePercent:
        typeof body.splitSharePercent === "number" ? body.splitSharePercent : null,
    });

    // Optional initial goal for the current month — audited the same as the
    // dedicated goal PUT, so every goal write leaves a team.goal_set row.
    const goalCents = Number(body.goalCents);
    if (Number.isFinite(goalCents) && goalCents > 0) {
      const month = businessTodayYmd().slice(0, 7);
      if (isValidGoalMonth(month)) {
        await setGoalCents(adminId, month, goalCents);
        logAuditEvent({
          adminId: actor.admin.id,
          adminUsername: actor.admin.username,
          action: "team.goal_set",
          targetType: "team_member",
          targetId: adminId,
          details: JSON.stringify({ month, goalCents: Math.round(goalCents) }),
        }).catch(() => {});
      }
    }

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.member_add",
      targetType: "team_member",
      targetId: adminId,
      details: JSON.stringify({ position: member.position, attribution }),
    }).catch(() => {});

    return NextResponse.json({ data: member }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateTeamMemberError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[team] POST member failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
