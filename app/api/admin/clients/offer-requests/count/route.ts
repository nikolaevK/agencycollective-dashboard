export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { countNewOfferRequests } from "@/lib/portalOffers";

/** Number of "new" portal service requests the actor can see — the Cross-sell tab badge. */
export async function GET() {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  return NextResponse.json({ data: { count: await countNewOfferRequests(guard.actor.scope) } });
}
