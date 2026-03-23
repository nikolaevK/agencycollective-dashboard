export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats } from "@/lib/deals";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closer = await findCloser(session.closerId);
  if (!closer) {
    return NextResponse.json({ error: "Closer not found" }, { status: 404 });
  }

  const [deals, stats] = await Promise.all([
    readDealsByCloser(session.closerId),
    getCloserDealStats(session.closerId),
  ]);

  return NextResponse.json({
    data: {
      closer: {
        id: closer.id,
        displayName: closer.displayName,
        role: closer.role,
        quota: closer.quota,
        commissionRate: closer.commissionRate,
      },
      stats,
      recentDeals: deals.slice(0, 10),
    },
  });
}
