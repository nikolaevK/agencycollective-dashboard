export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getTeamActor } from "@/lib/teamAuth";
import { autoSplitCsmBook } from "@/lib/teamHub";
import { logAuditEvent } from "@/lib/auditLog";

/**
 * Balance-assign active clients without a CSM across the CSM-attribution
 * roster members. Without { confirm: true } this is a DRY RUN returning the
 * proposed assignments; with it, assignments are materialized as client_team
 * rows (manually adjustable afterwards). Privileged only.
 */
export async function POST(request: Request) {
  const actor = await getTeamActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.privileged)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureMigrated();

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // no body = dry run
  }
  const confirm = body.confirm === true;

  try {
    const result = await autoSplitCsmBook({ id: actor.admin.id }, { confirm });
    if (confirm && result.applied) {
      logAuditEvent({
        adminId: actor.admin.id,
        adminUsername: actor.admin.username,
        action: "team.auto_split_csm",
        targetType: "team",
        details: JSON.stringify(
          result.assignments.map((a) => ({ client: a.clientName, to: a.adminName }))
        ),
      }).catch(() => {});
    }
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[team] POST auto-split-csm failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
