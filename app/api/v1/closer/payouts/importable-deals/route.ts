export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readDeals } from "@/lib/deals";
import { readClosers } from "@/lib/closers";
import { getImportedDealIds } from "@/lib/payouts";
import { getDealContractStatuses, type DealContractStatus } from "@/lib/dealContracts";
import { getDealsWithInvoicePdf } from "@/lib/dealInvoices";

/** Matches the dashboard picker's ceiling (deal-status lookups cap at 500). */
const CAP = 200;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Closed deals eligible for payout import, enriched with contract status,
 * invoice-PDF availability, and an alreadyImported flag.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const deals = await readDeals({ status: "closed", limit: CAP });
    const dealIds = deals.map((d) => d.id);
    const [contractStatuses, dealsWithPdf, importedIds, closers] = await Promise.all([
      getDealContractStatuses(dealIds),
      getDealsWithInvoicePdf(dealIds),
      getImportedDealIds(),
      readClosers(),
    ]);
    const closerNames = new Map(closers.map((c) => [c.id, c.displayName]));

    const enriched = deals.map((d) => {
      const contractStatus: DealContractStatus | null =
        contractStatuses[d.id]?.status ?? null;
      return {
        id: d.id,
        clientName: d.clientName,
        brandName: d.brandName,
        website: d.website,
        dealValue: d.dealValue,
        serviceCategory: d.serviceCategory,
        closingDate: d.closingDate,
        paidStatus: d.paidStatus,
        closerId: d.closerId,
        closerName: closerNames.get(d.closerId) ?? null,
        contractStatus,
        hasInvoicePdf: dealsWithPdf.has(d.id),
        alreadyImported: importedIds.has(d.id),
        eligible:
          !importedIds.has(d.id) &&
          (contractStatus === "signed" || d.paidStatus === "paid"),
      };
    });

    return ok(enriched);
  } catch (err) {
    console.error("GET /api/v1/closer/payouts/importable-deals error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
