export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { buildClientDirectory, filterRowsByWorkspace } from "@/lib/clientDirectory";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { withFollowUpSummaries } from "@/lib/invoiceFollowUps";

/**
 * Live-computed list of clients with a re-bill invoice currently awaiting
 * payment. Mirrors the rebill-alerts endpoint so the page can render both
 * panels with the same fetch rhythm.
 *
 * Reuses `buildClientDirectory` — it already loads every client's active
 * invoice AND runs the sent → paid reconciliation against the Payout DB — so
 * an invoice whose cycle has been paid since send is dropped here for free.
 * Same payout-history cache (90s) backs both panels.
 */
export async function GET() {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const rows = filterRowsByWorkspace(await buildClientDirectory(), actor.scope);

  const invoices = rows
    // Inactive/archived clients drop out of the awaiting-payment count/panel
    // (mirrors the rebill-alerts exclusion) — their row keeps the invoice.
    .filter((r) => r.status !== "inactive" && r.status !== "archived")
    // EVERY awaiting invoice, not just the client's current one — an earlier
    // cycle still unpaid must stay visible (and chaseable) here.
    .flatMap((r) =>
      r.sentInvoices.map((inv) => ({
        id: inv.id,
        userId: r.id,
        clientName: r.displayName,
        clientSlug: r.slug,
        clientLogoPath: r.logoPath,
        invoiceNumber: inv.invoiceNumber,
        cycleAnchor: inv.cycleAnchor,
        amountCents: inv.amountCents,
        sentAt: inv.sentAt,
        recipientEmail: inv.recipientEmail,
        // Follow-up inputs: the filed PDF, original CCs + style.
        payoutDocumentId: inv.payoutDocumentId,
        ccEmails: inv.ccEmails,
        styleProfileId: inv.styleProfileId,
        status: inv.status,
        /** Anchored to the client's current cycle (drives "Invoice sent"). */
        isCurrentCycle: inv.cycleAnchor === r.schedule.nextRebillAt,
      }))
    )
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));

  // Each row carries its follow-up summary (count + latest touch).
  const withFollowUps = await withFollowUpSummaries("client_rebill", invoices);

  return NextResponse.json({
    data: {
      invoices: withFollowUps,
      count: withFollowUps.length,
    },
  });
}
