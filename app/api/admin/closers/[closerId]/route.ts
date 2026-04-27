export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findCloser } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats, type DealStatus } from "@/lib/deals";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  _request: Request,
  { params }: { params: { closerId: string } }
) {
  const session = getAdminSession();
  if (!session) return unauthorized();
  const admin = await findAdmin(session.adminId);
  if (!admin) return unauthorized();

  const closer = await findCloser(params.closerId);
  if (!closer) {
    return NextResponse.json({ error: "Closer not found" }, { status: 404 });
  }

  const [allDeals, stats] = await Promise.all([
    readDealsByCloser(params.closerId),
    // Lifetime-only on this drill-down. The admin "view as user" page handles
    // time-frame slicing; here we surface the closer's career numbers.
    getCloserDealStats(params.closerId),
  ]);

  // Same hidden-statuses rule as /api/admin/deals: in-flight deals belong
  // to the closer's own portal, not the admin's drill-down. The admin sees
  // each closer's closed + pending pipeline here; live activity (rescheduled,
  // follow-up, not_closed) lives behind the "View their dashboard" button.
  const ADMIN_HIDDEN_STATUSES: ReadonlySet<DealStatus> = new Set([
    "rescheduled",
    "follow_up",
    "not_closed",
  ]);
  const deals = allDeals.filter((d) => !ADMIN_HIDDEN_STATUSES.has(d.status));

  const { passwordHash: _, ...safeCloser } = closer;

  return NextResponse.json({
    data: {
      closer: { ...safeCloser, hasPassword: _ !== null },
      deals,
      stats,
    },
  });
}
