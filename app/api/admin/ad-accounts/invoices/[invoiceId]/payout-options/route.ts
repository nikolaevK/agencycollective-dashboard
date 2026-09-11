export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findAdAccountInvoice } from "@/lib/adAccountInvoices";
import { requireInternalActor, findAdAccountInScope } from "@/lib/api/requireAdmin";
import { listPayoutRowsForBrand } from "@/lib/payouts";
import { resolveAdInvoiceBrand } from "@/lib/adAccountInvoiceBrand";
import type { AdAccount } from "@/lib/adAccounts";

interface RouteContext {
  params: { invoiceId: string };
}

/**
 * Payout rows an admin may link this ad-account invoice to (the brand's
 * ledger, newest first). Internal-only — partner scopes never see the Payout
 * DB. Free invoices (no account) fall back to the brand snapshot on the row.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  if (!invoice)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  let account: AdAccount | null = null;
  if (invoice.adAccountId) {
    account = await findAdAccountInScope(guard.actor.scope, invoice.adAccountId);
    if (!account)
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  const { brand, exactOnly } = await resolveAdInvoiceBrand(invoice, account);

  const payouts = brand ? await listPayoutRowsForBrand(brand, exactOnly) : [];
  return NextResponse.json({ data: { brand, payouts } });
}
