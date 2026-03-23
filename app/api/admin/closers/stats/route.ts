export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { getTeamStats } from "@/lib/deals";
import { readClosers } from "@/lib/closers";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = getAdminSession();
  if (!session) return unauthorized();
  const admin = await findAdmin(session.adminId);
  if (!admin) return unauthorized();

  const [stats, closers] = await Promise.all([
    getTeamStats(),
    readClosers(),
  ]);

  const activeCount = closers.filter((c) => c.status === "active").length;
  const totalClosers = closers.length;
  const avgCommission =
    closers.length > 0
      ? closers.reduce((sum, c) => sum + c.commissionRate, 0) / closers.length
      : 0;

  // Find top performer
  const topPerformer = stats.closerBreakdowns.length > 0
    ? stats.closerBreakdowns[0] // already sorted DESC by revenue
    : null;

  const closeRate =
    stats.totalDeals > 0
      ? (stats.closedDeals / stats.totalDeals) * 100
      : 0;

  return NextResponse.json({
    data: {
      totalRevenue: stats.totalRevenue,
      totalDeals: stats.totalDeals,
      closedDeals: stats.closedDeals,
      closeRate: Math.round(closeRate * 10) / 10,
      topPerformer,
      closerBreakdowns: stats.closerBreakdowns,
      totalClosers,
      activeCount,
      avgCommission: Math.round(avgCommission),
    },
  });
}
