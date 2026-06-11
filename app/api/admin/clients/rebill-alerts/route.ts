export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { buildClientDirectory } from "@/lib/clientDirectory";
import { isRebillAlertStatus } from "@/lib/clientBilling";
import { listDueReminders } from "@/lib/clientNotes";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

/**
 * Live-computed re-bill alerts: ACTIVE clients whose next bill is due/overdue
 * (and not paused or extended), plus any due client reminders. No background
 * job — the schedule is recomputed from the Payout DB + billing config on each
 * call, matching how the Meta alert feed already works.
 *
 * Only `status === "active"` clients raise a re-bill alert. Onboarding clients
 * aren't billing yet; inactive/archived clients have been stood down — neither
 * should nag in the alerts banner even if their schedule math says overdue
 * (an inactive client doesn't need a separate billing pause to go quiet).
 */
export async function GET() {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const [rows, dueReminders] = await Promise.all([
    buildClientDirectory(),
    listDueReminders(),
  ]);

  // PepAds-book clients are excluded: their billing status is maintained
  // manually (profile.manualBilling / manualNextRebill), so the computed
  // schedule must not raise alerts for them.
  const rebills = rows
    .filter(
      (r) =>
        r.status === "active" &&
        r.profile.book !== "pepads" &&
        isRebillAlertStatus(r.schedule.status)
    )
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      displayName: r.displayName,
      logoPath: r.logoPath,
      status: r.schedule.status, // "due" | "overdue"
      nextRebillAt: r.schedule.nextRebillAt,
      lastRebilledAt: r.schedule.lastRebilledAt,
      daysUntilDue: r.schedule.daysUntilDue,
      payoutMrr: r.payoutMrr,
    }))
    .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));

  const reminders = dueReminders.map((n) => ({
    id: n.id,
    userId: n.userId,
    clientName: n.clientName,
    clientSlug: n.clientSlug,
    body: n.body,
    remindAt: n.remindAt,
  }));

  return NextResponse.json({
    data: {
      rebills,
      reminders,
      count: rebills.length + reminders.length,
      overdueCount: rebills.filter((r) => r.status === "overdue").length,
    },
  });
}
