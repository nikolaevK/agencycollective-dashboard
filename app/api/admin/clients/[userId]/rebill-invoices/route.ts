export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { listInvoicesForUser } from "@/lib/clientRebillInvoices";
import { withFollowUpSummaries } from "@/lib/invoiceFollowUps";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

/** Every re-bill invoice (all statuses, newest first) for one client. */
export async function GET(_req: Request, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  // Each invoice carries its follow-up summary (count + latest touch).
  const invoices = await withFollowUpSummaries(
    "client_rebill",
    await listInvoicesForUser(params.userId)
  );
  return NextResponse.json({ data: { invoices } });
}
