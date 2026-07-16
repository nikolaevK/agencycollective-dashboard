export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getAdAccount } from "@/lib/adAccounts";
import { listInvoicesForAdAccount } from "@/lib/adAccountInvoices";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";


interface RouteContext {
  params: { id: string };
}


/** Every invoice (all statuses, newest first) stored under one ad account. */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const account = await getAdAccount(params.id);
  if (!account)
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const invoices = await listInvoicesForAdAccount(params.id);
  return NextResponse.json({ data: { invoices } });
}
