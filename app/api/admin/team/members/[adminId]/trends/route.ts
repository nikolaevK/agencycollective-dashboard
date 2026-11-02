export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor, canManageMemberScoped } from "@/lib/teamAuth";
import { buildMemberTrends } from "@/lib/teamHub";

interface RouteContext {
  params: { adminId: string };
}

/**
 * Read-only history for one member hub (12 months of REBILL payouts + goals,
 * 12 weeks of task throughput). Same access as the hub itself: self,
 * privileged, or the member's Head of Ads.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageMemberScoped(actor, params.adminId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  try {
    const trends = await buildMemberTrends(params.adminId, actor.scope);
    if (!trends)
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    return NextResponse.json({ data: trends });
  } catch (err) {
    console.error("[team] GET member trends failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
