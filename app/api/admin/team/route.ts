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

  const url = new URL(request.url);
  const timeframe = parseTimeframe(url.searchParams.get("timeframe"));
  // Unscoped (super / Admin Management) viewers can pin the overview to one
  // book via ?workspace= — it simply becomes the viewer scope for this build.
  // Scoped actors always get their own scope (the param is ignored).
  const wsParam = url.searchParams.get("workspace")?.trim() || null;
  const viewerScope =
    actor.scope !== null ? actor.scope : wsParam ? [wsParam] : null;
  try {
    const directory = await buildTeamDirectory(timeframe, viewerScope);
    return NextResponse.json({
      data: { ...directory, viewer: { adminId: actor.admin.id, privileged: actor.privileged } },
    });
  } catch (err) {
    console.error("[team] GET directory failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
