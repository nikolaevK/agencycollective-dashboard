export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSetterFromSession } from "@/lib/closerGuards";
import {
  getSetterStats,
  getSetterRecentDeals,
  getSetterFollowUps,
} from "@/lib/setterStats";
import { enrichNoShowsFromCalendar, getNoShowFollowUpsTeamWide } from "@/lib/eventAttendance";

export async function GET() {
  const setter = await getSetterFromSession();
  if (!setter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [stats, recentDeals, followUps, rawNoShows] = await Promise.all([
    getSetterStats(setter.id, setter.commissionRate),
    getSetterRecentDeals(setter.id),
    getSetterFollowUps(setter.id),
    // Team-wide: setters are the front line on no-show outreach.
    getNoShowFollowUpsTeamWide(),
  ]);
  // Enrich from Google Calendar so no-shows without an appointment or deal
  // still show a client name, email, time, and meet link.
  const noShowFollowUps = await enrichNoShowsFromCalendar(rawNoShows);

  return NextResponse.json({
    data: {
      setter: {
        id: setter.id,
        displayName: setter.displayName,
        commissionRate: setter.commissionRate,
      },
      stats,
      recentDeals,
      followUps,
      noShowFollowUps,
    },
  });
}
