export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor } from "@/lib/teamAuth";
import { readAdmins } from "@/lib/admins";
import { workspaceMembershipOf } from "@/lib/workspaces";
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

    // Members this viewer can open/manage as a Head of Ads book manager —
    // drives the card drill-in for non-privileged leads (the per-member API
    // enforces the same rule server-side via canManageMemberScoped).
    let managedAdminIds: string[] = [];
    if (!actor.privileged && actor.managedWorkspaces.length > 0) {
      const adminById = new Map((await readAdmins()).map((a) => [a.id, a] as const));
      managedAdminIds = directory.members
        .filter((m) => {
          const admin = adminById.get(m.adminId);
          if (!admin) return false;
          const membership = workspaceMembershipOf(admin);
          return actor.managedWorkspaces.some((w) => membership.includes(w));
        })
        .map((m) => m.adminId);
    }

    return NextResponse.json({
      data: {
        ...directory,
        viewer: {
          adminId: actor.admin.id,
          privileged: actor.privileged,
          managedAdminIds,
        },
      },
    });
  } catch (err) {
    console.error("[team] GET directory failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
