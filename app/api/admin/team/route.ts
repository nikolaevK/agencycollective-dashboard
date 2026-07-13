export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor } from "@/lib/teamAuth";
import { buildTeamDirectory, parseTimeframe } from "@/lib/teamHub";

/**
 * Team home directory: roster member summaries (clients / MRR-managed vs goal /
 * health / rebills / task stats / unsolved items), whole-book KPI totals, slim
 * client slices for the drilldown panels, and unrostered assignees. Visible to
 * EVERY logged-in admin (the per-member detail is what's gated).
 */
export async function GET(request: Request) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const timeframe = parseTimeframe(new URL(request.url).searchParams.get("timeframe"));
  try {
    const directory = await buildTeamDirectory(timeframe);
    return NextResponse.json({
      data: { ...directory, viewer: { adminId: actor.admin.id, privileged: actor.privileged } },
    });
  } catch (err) {
    console.error("[team] GET directory failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
