export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { listInvoicesForAdAccount } from "@/lib/adAccountInvoices";
import { requireDirectoryActor, findAdAccountInScope } from "@/lib/api/requireAdmin";


interface RouteContext {
  params: { id: string };
}


/** Every invoice (all statuses, newest first) stored under one ad account. */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const account = await findAdAccountInScope(actor.scope, params.id);
  if (!account)
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const invoices = await listInvoicesForAdAccount(params.id);
  return NextResponse.json({ data: { invoices } });
}
