export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSetterFromSession } from "@/lib/closerGuards";
import {
  getSetterStats,
  getSetterRecentDeals,
  getSetterFollowUps,
} from "@/lib/setterStats";
import { enrichNoShowsFromCalendar, getNoShowFollowUpsTeamWide } from "@/lib/eventAttendance";

export async function GET(request: Request) {
  const setter = await getSetterFromSession();
  if (!setter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const sinceRaw = searchParams.get("since");
  const untilRaw = searchParams.get("until");
  const since = sinceRaw && dateRe.test(sinceRaw) ? sinceRaw : undefined;
  const until = untilRaw && dateRe.test(untilRaw) ? untilRaw : undefined;

  const [stats, recentDeals, followUps, rawNoShows] = await Promise.all([
    getSetterStats(setter.id, setter.commissionRate, { since, until }),
    getSetterRecentDeals(setter.id),
    getSetterFollowUps(setter.id),
    getNoShowFollowUpsTeamWide(),
  ]);
  const noShowFollowUps = await enrichNoShowsFromCalendar(rawNoShows);

  return NextResponse.json({
    data: {
      setter: {
        id: setter.id,
        displayName: setter.displayName,
        commissionRate: setter.commissionRate,
      },
      stats,
      timeFrame: { since: since ?? null, until: until ?? null },
      recentDeals,
      followUps,
      noShowFollowUps,
    },
  });
}
