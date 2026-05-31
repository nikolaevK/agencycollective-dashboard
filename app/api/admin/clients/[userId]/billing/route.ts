export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { findUser } from "@/lib/users";
import { getClientDetail } from "@/lib/clientDirectory";
import { upsertClientBilling, type ClientBillingInput } from "@/lib/clientBilling";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

interface RouteContext {
  params: { userId: string };
}

/** Billing config + computed schedule + payment history for one client. */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const detail = await getClientDetail(params.userId);
  if (!detail)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      billing: detail.row.billing,
      schedule: detail.row.schedule,
      joinedAt: detail.row.joinedAt,
      payoutBrand: detail.row.payoutBrand,
      payoutMrr: detail.row.payoutMrr,
      totalRevenue: detail.row.totalRevenue,
      history: detail.history,
      // Currently-sent invoice for this client (already reconciled in
      // getClientDetail) — drives the Billing tab's awaiting-payment banner
      // + Mark Unpaid action. Null when nothing is awaiting payment.
      activeSentInvoice: detail.row.activeSentInvoice,
    },
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  // Don't create an orphan billing row for a non-existent client (libSQL FK
  // enforcement isn't guaranteed).
  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  try {
    const body = (await request.json()) as Partial<ClientBillingInput>;
    const changes: ClientBillingInput = {};

    if (body.cadence !== undefined) changes.cadence = String(body.cadence);
    if (body.billingDay !== undefined) {
      const n = Number(body.billingDay);
      changes.billingDay =
        body.billingDay === null || !Number.isFinite(n)
          ? null
          : Math.min(31, Math.max(1, Math.trunc(n)));
    }
    if (body.paused !== undefined) changes.paused = Boolean(body.paused);
    if (body.pauseReason !== undefined)
      changes.pauseReason = body.pauseReason ? String(body.pauseReason).slice(0, 500) : null;
    if (body.extendUntil !== undefined)
      changes.extendUntil = body.extendUntil ? String(body.extendUntil) : null;
    if (body.lastRebilledOverride !== undefined)
      changes.lastRebilledOverride = body.lastRebilledOverride
        ? String(body.lastRebilledOverride)
        : null;
    if (body.mrrMonthOverride !== undefined) {
      const v = body.mrrMonthOverride ? String(body.mrrMonthOverride) : null;
      if (v !== null && !/^\d{4}-\d{2}$/.test(v)) {
        return NextResponse.json(
          { error: "mrrMonthOverride must be 'yyyy-mm' or null" },
          { status: 400 }
        );
      }
      changes.mrrMonthOverride = v;
    }
    if (body.leadDays !== undefined)
      changes.leadDays = Math.max(0, Number(body.leadDays) || 0);
    if (body.settingsNotes !== undefined)
      changes.settingsNotes = body.settingsNotes ? String(body.settingsNotes).slice(0, 5000) : null;

    await upsertClientBilling(params.userId, changes);

    const detail = await getClientDetail(params.userId);
    return NextResponse.json({
      data: {
        billing: detail?.row.billing ?? null,
        schedule: detail?.row.schedule ?? null,
      },
    });
  } catch (err) {
    console.error("[client-billing] PATCH failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
