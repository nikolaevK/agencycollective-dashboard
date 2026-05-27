export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { buildClientDirectory } from "@/lib/clientDirectory";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

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
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const rows = await buildClientDirectory();

  const invoices = rows
    .filter((r) => r.activeSentInvoice !== null)
    .map((r) => {
      const inv = r.activeSentInvoice!;
      return {
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
      };
    })
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));

  return NextResponse.json({
    data: {
      invoices,
      count: invoices.length,
    },
  });
}
