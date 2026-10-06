export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findAdAccountInvoice } from "@/lib/adAccountInvoices";
import { requireInternalActor, findAdInvoiceAccountInScope } from "@/lib/api/requireAdmin";
import { listPayoutRowsForBrand } from "@/lib/payouts";
import { resolveAdInvoiceBrand } from "@/lib/adAccountInvoiceBrand";

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

  const access = await findAdInvoiceAccountInScope(guard.actor.scope, invoice);
  if (!access.ok)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const { brand, exactOnly } = await resolveAdInvoiceBrand(invoice, access.account);

  const payouts = brand ? await listPayoutRowsForBrand(brand, exactOnly) : [];
  return NextResponse.json({ data: { brand, payouts } });
}
