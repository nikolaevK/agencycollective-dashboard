export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats } from "@/lib/deals";
import { readClosers } from "@/lib/closers";
import {
  enrichNoShowsFromCalendar,
  getAttendanceFollowUpsForCloser,
  getCloserShowRate,
} from "@/lib/eventAttendance";
import { getDealInvoiceStatuses } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";

export async function GET(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const closer = await findCloser(session.closerId);
  if (!closer) {
    return NextResponse.json({ error: "Closer not found" }, { status: 404 });
  }

  // Optional time-frame window — same shape used by the admin queue.
  // Validated against YYYY-MM-DD so client can't smuggle SQL through.
  const { searchParams } = new URL(request.url);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const sinceRaw = searchParams.get("since");
  const untilRaw = searchParams.get("until");
  const since = sinceRaw && dateRe.test(sinceRaw) ? sinceRaw : undefined;
  const until = untilRaw && dateRe.test(untilRaw) ? untilRaw : undefined;

  const [deals, stats, lifetimeShow, windowResult, rawNoShows, rawShowed] = await Promise.all([
    readDealsByCloser(session.closerId),
    getCloserDealStats(session.closerId, { since, until }),
    // Show metrics come from event_attendance (every event the closer
    // marked, with or without a linked deal) — overrides the bucket's
    // deal-sourced show fields, which would under-count no-shows the
    // closer marked but never wrote a deal for.
    getCloserShowRate(session.closerId),
    // Skip the duplicate fetch when no window is set; window === lifetime.
    since && until ? getCloserShowRate(session.closerId, { since, until }) : null,
    getAttendanceFollowUpsForCloser(session.closerId, "no_show"),
    getAttendanceFollowUpsForCloser(session.closerId, "showed"),
  ]);
  const windowShow = windowResult ?? lifetimeShow;
  // Splice the attendance-sourced show metrics into the bucket so
  // dashboard cards display the closer's true show rate.
  stats.lifetime.showCount = lifetimeShow.showCount;
  stats.lifetime.noShowCount = lifetimeShow.noShowCount;
  stats.lifetime.showRate = lifetimeShow.showRate;
  stats.window.showCount = windowShow.showCount;
  stats.window.noShowCount = windowShow.noShowCount;
  stats.window.showRate = windowShow.showRate;

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
      closer: {
        id: closer.id,
        displayName: closer.displayName,
        role: closer.role,
        quota: closer.quota,
        commissionRate: closer.commissionRate,
      },
      stats,
      timeFrame: { since: since ?? null, until: until ?? null },
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
  });
}
