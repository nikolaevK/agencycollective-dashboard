export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, getEffectivePermissions } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { buildClientDirectory } from "@/lib/clientDirectory";

/**
 * Live baseline for the Revenue Projection tool, sourced from the same
 * Client Directory aggregate the /dashboard/users table renders. Returns the
 * count of active clients (the "starting active book") and their average
 * Monthly MRR (the "avg retainer / active client" lever), both computed across
 * ALL active clients — a $0/unlinked active still counts toward the average.
 *
 * Middleware gates /api/admin/projection on the `dashboard` permission; the
 * handler re-checks session + permission as defense in depth.
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = getEffectivePermissions(admin);
  if (!admin.isSuper && !perms.dashboard) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureMigrated();

  const rows = await buildClientDirectory();
  const active = rows.filter((r) => r.status === "active");

  const activeClientCount = active.length;
  const totalMrrCents = active.reduce((sum, r) => sum + (r.payoutMrr || 0), 0);
  const averageMrrCents =
    activeClientCount > 0 ? Math.round(totalMrrCents / activeClientCount) : 0;

  return NextResponse.json({
    data: {
      activeClientCount,
      // Dollars (payoutMrr is stored in cents) — matches the tool's sliders.
      averageMrr: Math.round(averageMrrCents / 100),
      totalMrr: Math.round(totalMrrCents / 100),
      generatedAt: new Date().toISOString(),
    },
  });
}
