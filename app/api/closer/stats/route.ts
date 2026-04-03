export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats } from "@/lib/deals";
import { getCloserShowRate } from "@/lib/eventAttendance";
import { getDealInvoiceStatuses } from "@/lib/dealInvoices";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closer = await findCloser(session.closerId);
  if (!closer) {
    return NextResponse.json({ error: "Closer not found" }, { status: 404 });
  }

  const [deals, stats, showRateStats] = await Promise.all([
    readDealsByCloser(session.closerId),
    getCloserDealStats(session.closerId),
    getCloserShowRate(session.closerId),
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
      stats: {
        totalRevenue: stats.totalRevenue,
        dealCount: stats.dealCount,
        closedCount: stats.closedCount,
        avgDealValue: stats.avgDealValue,
        showRate: showRateStats.showRate,
        showCount: showRateStats.showCount,
        noShowCount: showRateStats.noShowCount,
      },
      recentDeals: await (async () => {
        const recent = deals.slice(0, 10);
        const invoiceStatuses = await getDealInvoiceStatuses(recent.map((d) => d.id));
        return recent.map((d) => ({
          ...d,
          invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
          invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
        }));
      })(),
    },
  });
}
