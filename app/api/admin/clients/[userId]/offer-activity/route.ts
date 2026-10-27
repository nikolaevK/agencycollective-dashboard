export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { isExternalScope } from "@/lib/workspaces";
import { getClientOfferActivity } from "@/lib/portalOffers";

/**
 * Which of our other services this client opened in the portal, how often,
 * and what they asked for — the client overview's call-prep card. Internal
 * admins only (the catalog is the agency's own cross-sell).
 */
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  if (isExternalScope(guard.actor.scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data: await getClientOfferActivity(params.userId) });
}
