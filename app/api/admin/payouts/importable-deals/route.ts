export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readDeals } from "@/lib/deals";
import { getDealContractStatuses } from "@/lib/dealContracts";
import { getDealsWithInvoicePdf } from "@/lib/dealInvoices";
import { getImportedDealIds } from "@/lib/payouts";
import { readClosers } from "@/lib/closers";

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  // Defense in depth — the route is also middleware-gated on `closers`.
  if (!session.isSuper && !session.permissions.closers) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return admin;
}

export interface ImportableDeal {
  dealId: string;
  clientName: string;
  brandName: string | null;
  dealValue: number; // cents
  closerName: string | null;
  closingDate: string | null;
  serviceCategory: string | null;
  industry: string | null;
  notes: string | null;
  clientEmail: string | null;
  paidStatus: "paid" | "unpaid";
  hasInvoice: boolean;
  alreadyImported: boolean;
}

/**
 * List deals eligible to import into the Payout Tracker: status === 'closed'
 * AND a DocuSeal contract that is 'signed'. Enriched with closer name, invoice
 * availability, and whether the deal was already imported (one payout per deal).
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allClosed = (await readDeals()).filter((d) => d.status === "closed");
  if (allClosed.length === 0) return NextResponse.json({ data: [] });

  // The batch enrichment helpers cap at 500 IDs. readDeals() is ordered by
  // created_at DESC, so explicitly take the 500 most-recent closed deals (the
  // "recently closed" target) and log if older ones are dropped — no silent
  // truncation. Closed+signed volume is well under this today.
  const CAP = 500;
  if (allClosed.length > CAP) {
    console.warn(
      `[importable-deals] ${allClosed.length} closed deals exceed the ${CAP} cap; ` +
        `older closed deals are not offered for import.`
    );
  }
  const deals = allClosed.slice(0, CAP);

  const dealIds = deals.map((d) => d.id);
  const [contractStatuses, invoicePdfDealIds, importedIds, closers] =
    await Promise.all([
      getDealContractStatuses(dealIds),
      getDealsWithInvoicePdf(dealIds),
      getImportedDealIds(),
      readClosers(),
    ]);

  const closerName = new Map(closers.map((c) => [c.id, c.displayName]));

  const data: ImportableDeal[] = deals
    .filter((d) => contractStatuses[d.id]?.status === "signed")
    .map((d) => ({
      dealId: d.id,
      clientName: d.clientName,
      brandName: d.brandName,
      dealValue: d.dealValue,
      closerName: closerName.get(d.closerId) ?? null,
      closingDate: d.closingDate,
      serviceCategory: d.serviceCategory,
      industry: d.industry,
      notes: d.notes,
      clientEmail: d.clientEmail,
      paidStatus: d.paidStatus,
      hasInvoice: invoicePdfDealIds.has(d.id),
      alreadyImported: importedIds.has(d.id),
    }));

  return NextResponse.json({ data });
}
