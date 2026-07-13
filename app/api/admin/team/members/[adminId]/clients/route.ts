export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor } from "@/lib/teamAuth";
import { getTeamMember } from "@/lib/teamMembers";
import { getClientTeam, setClientTeam } from "@/lib/clientProfile";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { adminId: string };
}

/**
 * Assign / unassign one client to this CSM member from the Team page:
 * { clientId, assigned: boolean }. Adds or removes THIS admin in the
 * client's csm role set (other csm assignees untouched) via the same
 * replace-set writer the Client Directory pickers use. Privileged only.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.privileged)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  const member = await getTeamMember(params.adminId);
  if (!member)
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  if (member.attribution !== "csm") {
    return NextResponse.json(
      { error: "Client assignment from the Team page is for CSM-attribution members" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  if (typeof body.assigned !== "boolean") {
    return NextResponse.json({ error: "assigned must be a boolean" }, { status: 400 });
  }
  if (!(await findUser(clientId))) {
    return NextResponse.json({ error: "Unknown clientId" }, { status: 400 });
  }

  try {
    const current = (await getClientTeam(clientId))
      .filter((t) => t.role === "csm")
      .map((t) => t.adminId);
    const next = body.assigned
      ? [...new Set([...current, params.adminId])]
      : current.filter((id) => id !== params.adminId);
    await setClientTeam(clientId, "csm", next, actor.admin.id);

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: body.assigned ? "team.csm_assign" : "team.csm_unassign",
      targetType: "client_team",
      targetId: clientId,
      details: JSON.stringify({ csmAdminId: params.adminId }),
    }).catch(() => {});

    return NextResponse.json({ data: { clientId, assigned: body.assigned } });
  } catch (err) {
    console.error("[team] POST member clients failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
