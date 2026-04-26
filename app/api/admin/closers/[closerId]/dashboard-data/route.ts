export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findCloser, readClosers } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats } from "@/lib/deals";
import {
  enrichNoShowsFromCalendar,
  getAttendanceFollowUpsForCloser,
  getCloserShowRate,
  getNoShowFollowUpsTeamWide,
} from "@/lib/eventAttendance";
import { getDealInvoiceStatuses } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";
import {
  getSetterStats,
  getSetterRecentDeals,
  getSetterFollowUps,
} from "@/lib/setterStats";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Admin "view as user" — returns role + the matching dashboard payload in
 * one request. Combining the two admin shapes into a discriminated union
 * (a) avoids a two-step "fetch role then fetch stats" sequence that left
 * the page body empty in between, and (b) closes the (rare) race where
 * the user's role flips between those two fetches and the stats endpoint
 * 400s with "wrong role".
 *
 * Reuses the exact same lib functions the user-facing endpoints call so
 * the data the admin sees matches the user's portal byte-for-byte
 * (including the same Google Calendar enrichment cache hit).
 */
export async function GET(
  _request: Request,
  { params }: { params: { closerId: string } }
) {
  const session = getAdminSession();
  if (!session) return unauthorized();
  const admin = await findAdmin(session.adminId);
  if (!admin) return unauthorized();

  const target = await findCloser(params.closerId);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "setter") {
    const [stats, recentDeals, followUps, rawNoShows] = await Promise.all([
      getSetterStats(target.id, target.commissionRate),
      getSetterRecentDeals(target.id),
      getSetterFollowUps(target.id),
      getNoShowFollowUpsTeamWide(),
    ]);
    const noShowFollowUps = await enrichNoShowsFromCalendar(rawNoShows);

    return NextResponse.json({
      data: {
        role: "setter" as const,
        payload: {
          setter: {
            id: target.id,
            displayName: target.displayName,
            commissionRate: target.commissionRate,
          },
          stats,
          recentDeals,
          followUps,
          noShowFollowUps,
        },
      },
    });
  }

  // Closer (default for any non-setter role).
  const [deals, stats, showRateStats, rawNoShows, rawShowed] = await Promise.all([
    readDealsByCloser(target.id),
    getCloserDealStats(target.id),
    getCloserShowRate(target.id),
    getAttendanceFollowUpsForCloser(target.id, "no_show"),
    getAttendanceFollowUpsForCloser(target.id, "showed"),
  ]);
  const enriched = await enrichNoShowsFromCalendar([...rawNoShows, ...rawShowed]);
  const noShowFollowUps = enriched.slice(0, rawNoShows.length);
  const showedFollowUps = enriched.slice(rawNoShows.length);

  const dealIds = deals.map((d) => d.id);
  const [invoiceStatuses, contractStatuses, allClosers] = await Promise.all([
    getDealInvoiceStatuses(dealIds),
    getDealContractStatuses(dealIds),
    readClosers(),
  ]);
  const nameById = new Map(allClosers.map((c) => [c.id, c.displayName]));

  return NextResponse.json({
    data: {
      role: "closer" as const,
      payload: {
        closer: {
          id: target.id,
          displayName: target.displayName,
          role: target.role,
          quota: target.quota,
          commissionRate: target.commissionRate,
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
        recentDeals: deals.map((d) => ({
          ...d,
          invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
          invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
          contractStatus: contractStatuses[d.id]?.status ?? null,
          setterName: d.setterId ? (nameById.get(d.setterId) ?? null) : null,
        })),
        noShowFollowUps,
        showedFollowUps,
      },
    },
  });
}
