export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import {
  getTeamStats,
  getTeamMonthlyTrend,
  previousWindowBounds,
  computeCloseRate,
} from "@/lib/deals";
import { getTeamShowRate } from "@/lib/eventAttendance";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) return unauthorized();
  const admin = await findAdmin(session.adminId);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(request.url);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const sinceRaw = searchParams.get("since");
  const untilRaw = searchParams.get("until");
  const since = sinceRaw && dateRe.test(sinceRaw) ? sinceRaw : undefined;
  const until = untilRaw && dateRe.test(untilRaw) ? untilRaw : undefined;
  const prevBounds = since && until ? previousWindowBounds(since, until) : null;

  const [stats, lifetimeShow, windowResult, previousShowResult, monthlyTrend] =
    await Promise.all([
      getTeamStats({ since, until }),
      // Show metrics from event_attendance (every mark, with or without a
      // linked deal) — overrides the bucket's deal-sourced show fields.
      getTeamShowRate(),
      // Skip the duplicate fetch when no window is set; window === lifetime.
      since && until ? getTeamShowRate({ since, until }) : null,
      prevBounds ? getTeamShowRate(prevBounds) : null,
      getTeamMonthlyTrend(),
    ]);
  const windowShow = windowResult ?? lifetimeShow;

  // Splice attendance-sourced show metrics into the buckets and the
  // per-closer breakdown so admin's numbers match what each closer sees.
  stats.lifetime.showCount = lifetimeShow.showCount;
  stats.lifetime.noShowCount = lifetimeShow.noShowCount;
  stats.lifetime.showRate = lifetimeShow.showRate;
  stats.window.showCount = windowShow.showCount;
  stats.window.noShowCount = windowShow.noShowCount;
  stats.window.showRate = windowShow.showRate;
  if (stats.previous && previousShowResult) {
    stats.previous.showCount = previousShowResult.showCount;
    stats.previous.noShowCount = previousShowResult.noShowCount;
    stats.previous.showRate = previousShowResult.showRate;
  }

  const showByCloser = new Map(windowShow.closerBreakdowns.map((b) => [b.closerId, b]));
  for (const cb of stats.closerBreakdowns) {
    const sr = showByCloser.get(cb.closerId);
    if (sr) {
      cb.showCount = sr.showCount;
      cb.noShowCount = sr.noShowCount;
      cb.showRate = sr.showRate;
    } else {
      cb.showCount = 0;
      cb.noShowCount = 0;
      cb.showRate = 0;
    }
  }

  // Top performer: the breakdown is already sorted DESC by closed revenue.
  // Skip the slot when even the leader has $0 — the card would otherwise
  // crown someone with no activity, which reads as a bug.
  const top = stats.closerBreakdowns[0];
  const topPerformer = top && top.revenue > 0 ? top : null;

  // True close rate: closed / (closed + pending + in-flight). The in-flight
  // bucket aggregates rescheduled / follow_up / not_closed deals so the
  // denominator matches the conventional "of all opportunities, what %
  // closed" definition — without surfacing individual in-flight deals to
  // the admin, which is the user-mandated visibility rule.
  const w = stats.window;
  const closeRate = computeCloseRate(w.closedCount, w.pendingCount, w.inFlightCount);

  return NextResponse.json({
    data: {
      lifetime: stats.lifetime,
      window: stats.window,
      previous: stats.previous,
      timeFrame: { since: since ?? null, until: until ?? null },
      closeRate,
      topPerformer,
      closerBreakdowns: stats.closerBreakdowns,
      monthlyTrend,
    },
  });
}
