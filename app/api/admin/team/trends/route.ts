export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor } from "@/lib/teamAuth";
import { buildTeamTrends } from "@/lib/teamHub";

/**
 * Read-only history for the Team overview's trend lines and charts: 12 months
 * of REBILL payouts + goals, 12 weeks of tasks created / completed — per
 * roster member and in total. Scoped exactly like GET /api/admin/team (same
 * ?workspace= pin for unscoped viewers, self-only viewers get their own row).
 */
export async function GET(request: Request) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const wsParam = new URL(request.url).searchParams.get("workspace")?.trim() || null;
  const viewerScope = actor.scope !== null ? actor.scope : wsParam ? [wsParam] : null;
  const selfOnly = !actor.privileged && actor.managedWorkspaces.length === 0;
  try {
    const trends = await buildTeamTrends(viewerScope, selfOnly ? actor.admin.id : null);
    return NextResponse.json({ data: trends });
  } catch (err) {
    console.error("[team] GET trends failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
