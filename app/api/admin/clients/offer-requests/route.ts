export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { inWorkspaceScope } from "@/lib/workspaces";
import { listOfferRequests } from "@/lib/portalOffers";

/**
 * Leads clients filed from the portal "More from Agency Collective" tab
 * (Client Directory → Cross-sell): every open lead + the most recent closed
 * ones. Internal admins, filtered to the books the actor can see (by the
 * client's CURRENT workspace).
 */
export async function GET() {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const { scope } = guard.actor;
  const rows = await listOfferRequests();
  return NextResponse.json({ data: rows.filter((r) => inWorkspaceScope(scope, r.workspace)) });
}
