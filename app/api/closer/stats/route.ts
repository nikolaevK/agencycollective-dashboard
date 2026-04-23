export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats } from "@/lib/deals";
import { readClosers } from "@/lib/closers";
import { enrichNoShowsFromCalendar, getCloserShowRate, getNoShowFollowUpsForCloser } from "@/lib/eventAttendance";
import { getDealInvoiceStatuses } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closer = await findCloser(session.closerId);
  if (!closer) {
    return NextResponse.json({ error: "Closer not found" }, { status: 404 });
  }

  const [deals, stats, showRateStats, rawNoShows] = await Promise.all([
    readDealsByCloser(session.closerId),
    getCloserDealStats(session.closerId),
    getCloserShowRate(session.closerId),
    getNoShowFollowUpsForCloser(session.closerId),
  ]);
  const noShowFollowUps = await enrichNoShowsFromCalendar(rawNoShows);

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
        const dealIds = deals.map((d) => d.id);
        const [invoiceStatuses, contractStatuses, allClosers] = await Promise.all([
          getDealInvoiceStatuses(dealIds),
          getDealContractStatuses(dealIds),
          readClosers(),
        ]);
        // Setters live in the closers table; one map resolves both roles.
        const nameById = new Map(allClosers.map((c) => [c.id, c.displayName]));
        return deals.map((d) => ({
          ...d,
          invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
          invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
          contractStatus: contractStatuses[d.id]?.status ?? null,
          setterName: d.setterId ? (nameById.get(d.setterId) ?? null) : null,
        }));
      })(),
      noShowFollowUps,
    },
  });
}
