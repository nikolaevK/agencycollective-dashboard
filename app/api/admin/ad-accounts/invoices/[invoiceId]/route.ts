export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {
  findAdAccountInvoice,
  reconcileInvoiceForAdAccount,
} from "@/lib/adAccountInvoices";
import {
  applyManualInvoiceUpdate,
  manualUpdateConflict,
} from "@/lib/invoiceManualOverride";
import { parseManualInvoicePatch } from "@/lib/api/invoiceManualPatch";
import { requireDirectoryActor, findAdAccountInScope } from "@/lib/api/requireAdmin";
import { isExternalScope } from "@/lib/workspaces";
import { resolveAdInvoiceBrand } from "@/lib/adAccountInvoiceBrand";
import {
  findPayout,
  payoutMatchesBrand,
  normalizeBrandName,
  brandsMatch,
  getAdAccountPayoutMonthsByBrand,
} from "@/lib/payouts";
import { logAuditEvent } from "@/lib/auditLog";
import type { AdAccount } from "@/lib/adAccounts";

interface RouteContext {
  params: { invoiceId: string };
}

/**
 * Manual override for one ad-account invoice: set paid/unpaid/sent by hand,
 * link it to a specific payout row, re-anchor its billing cycle, or hand it
 * back to the automation (`resync`). Every manual status locks the row
 * against read-time auto-promotion until the next resync.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  if (!invoice)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  let account: AdAccount | null = null;
  if (invoice.adAccountId) {
    account = await findAdAccountInScope(actor.scope, invoice.adAccountId);
    if (!account)
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  } else if (isExternalScope(actor.scope)) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const parsed = parseManualInvoicePatch(await req.json().catch(() => null));
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  // Payout relationship — internal only (the ledger is never exposed to
  // partner scopes), and the row must belong to this account's brand.
  let paidPayout: { id: string; month: number; year: number } | null | undefined;
  if (body.paidPayoutId !== undefined) {
    if (body.paidPayoutId === null) {
      paidPayout = null;
    } else {
      if (isExternalScope(actor.scope))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const payout = await findPayout(body.paidPayoutId);
      if (!payout)
        return NextResponse.json({ error: "Payout not found" }, { status: 404 });
      const { brand, exactOnly } = await resolveAdInvoiceBrand(invoice, account);
      if (!brand || !payoutMatchesBrand(payout.brandName, brand, exactOnly))
        return NextResponse.json(
          { error: "Payout does not belong to this account's brand" },
          { status: 400 }
        );
      paidPayout = { id: payout.id, month: payout.payoutMonth, year: payout.payoutYear };
    }
  }

  const conflict = manualUpdateConflict(invoice.status, {
    status: body.status,
    resync: body.resync,
    paidPayout,
  });
  if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

  try {
    const ok = await applyManualInvoiceUpdate("ad_account_invoices", invoice.id, {
      adminId: actor.admin.id,
      status: body.status,
      cycleAnchor: body.cycleAnchor,
      paidPayout,
      note: body.note,
      resync: body.resync,
    });
    if (!ok)
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    let updated = await findAdAccountInvoice(invoice.id);

    // After a resync the row is `sent` + unlocked — re-run the normal payout
    // reconciliation right away so a matching payment settles it at once.
    if (body.resync && updated && account) {
      const { brand, exactOnly } = await resolveAdInvoiceBrand(invoice, account);
      if (brand) {
        try {
          const byBrand = await getAdAccountPayoutMonthsByBrand();
          const norm = normalizeBrandName(brand);
          const months: Array<{ year: number; month: number }> = [];
          for (const [key, arr] of byBrand) {
            if (key === norm || (!exactOnly && brandsMatch(norm, key)))
              months.push(...arr);
          }
          updated = await reconcileInvoiceForAdAccount(updated, months);
        } catch {
          // best-effort — the directory build reconciles on next read
        }
      }
    }

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "ad_account_invoice.manual_override",
      targetType: "ad_account_invoice",
      targetId: invoice.id,
      details: JSON.stringify({
        status: body.status ?? null,
        cycleAnchor: body.cycleAnchor ?? null,
        paidPayoutId: body.paidPayoutId ?? null,
        resync: body.resync ?? false,
      }),
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[ad-account-invoice/manual]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
