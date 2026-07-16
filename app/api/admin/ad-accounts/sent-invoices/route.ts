export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { listActiveSentInvoices } from "@/lib/adAccountInvoices";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

/**
 * All currently-sent ad-account invoices (awaiting payment), joined with the
 * ad account + client. Powers the "Invoices Sent" panel + summary count, the
 * same way /api/admin/clients/sent-invoices does for client re-bill invoices.
 */
export async function GET() {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  const invoices = await listActiveSentInvoices();
  return NextResponse.json({ data: { invoices, count: invoices.length } });
}
