export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getClientRevenueTrends } from "@/lib/clientDirectory";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { businessTodayYmd } from "@/lib/businessTime";
import { trendMonths } from "@/lib/clientTrendSeries";

/**
 * Read-only 12-month payout activity per client (billed / collected /
 * re-billed, cents) for the Client Directory's trend lines and charts. Scoped
 * to the actor's workspace(s) like every directory list route; the window
 * ends with the current business month.
 */
export async function GET() {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const months = trendMonths(businessTodayYmd().slice(0, 7));
  const clients = await getClientRevenueTrends(actor.scope, months);
  return NextResponse.json({ data: { months, clients } });
}
