export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMember } from "@/lib/teamAuth";
import { buildMemberHub, parseTimeframe } from "@/lib/teamHub";
import {
  updateTeamMember,
  removeTeamMember,
  getTeamMember,
  parseAttribution,
  type TeamMemberInput,
} from "@/lib/teamMembers";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { adminId: string };
}

/** Member hub payload (summary + attributed client slices + goals). Self or privileged. */
export async function GET(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageMember(actor, params.adminId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  const timeframe = parseTimeframe(new URL(request.url).searchParams.get("timeframe"));
  try {
    const hub = await buildMemberHub(params.adminId, timeframe, actor.scope);
    if (!hub)
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    return NextResponse.json({
      data: { ...hub, viewer: { adminId: actor.admin.id, privileged: actor.privileged } },
    });
  } catch (err) {
    console.error("[team] GET member hub failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Update position / attribution / sort order. Privileged only. */
export async function PATCH(request: Request, { params }: RouteContext) {
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

  const changes: TeamMemberInput = {};
  if (typeof body.position === "string") changes.position = body.position;
  if (body.attribution !== undefined) {
    const attribution = parseAttribution(body.attribution);
    if (!attribution) {
      return NextResponse.json(
        { error: "attribution must be book, lead, media_buyer, or csm" },
        { status: 400 }
      );
    }
    changes.attribution = attribution;
  }
  if (typeof body.sortOrder === "number") changes.sortOrder = body.sortOrder;
  if (body.splitSharePercent !== undefined) {
    if (
      body.splitSharePercent !== null &&
      !(typeof body.splitSharePercent === "number" && body.splitSharePercent >= 0 && body.splitSharePercent <= 100)
    ) {
      return NextResponse.json(
        { error: "splitSharePercent must be 0-100 or null" },
        { status: 400 }
      );
    }
    changes.splitSharePercent = body.splitSharePercent as number | null;
  }

  const existing = await getTeamMember(params.adminId);
  if (!existing)
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  try {
    const member = await updateTeamMember(params.adminId, changes);
    // Row deleted between the existence check and the update (concurrent DELETE).
    if (!member)
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.member_update",
      targetType: "team_member",
      targetId: params.adminId,
      details: JSON.stringify(changes),
    }).catch(() => {});
    return NextResponse.json({ data: member });
  } catch (err) {
    console.error("[team] PATCH member failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Remove from the roster (deletes their goals/tasks/items). Privileged only. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.privileged)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  const existing = await getTeamMember(params.adminId);
  if (!existing)
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  try {
    await removeTeamMember(params.adminId);
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "team.member_remove",
      targetType: "team_member",
      targetId: params.adminId,
      details: JSON.stringify({ name: existing.name }),
    }).catch(() => {});
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    console.error("[team] DELETE member failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
