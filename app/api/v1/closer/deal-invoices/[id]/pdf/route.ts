export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob } from "@/lib/api/files";
import { tokenHasResource } from "@/lib/apiScopes";
import { findDeal } from "@/lib/deals";
import { findDealInvoiceMeta, getDealInvoicePdf } from "@/lib/dealInvoices";
import {
  findAdditionalInvoice,
  getAdditionalInvoicePdf,
} from "@/lib/dealAdditionalInvoices";

export function OPTIONS() {
  return corsPreflight();
}

/** Download the stored invoice PDF (primary or additional). */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    // Metadata-only lookups first (no BLOB), then fetch bytes.
    let dealId: string | null = null;
    let invoiceNumber: string | null = null;
    let pdf: Buffer | null = null;

    const primaryMeta = await findDealInvoiceMeta(params.id);
    if (primaryMeta) {
      dealId = primaryMeta.dealId;
      invoiceNumber = primaryMeta.invoiceNumber;
      pdf = await getDealInvoicePdf(params.id);
    } else {
      const extra = await findAdditionalInvoice(params.id);
      if (extra) {
        dealId = extra.dealId;
        invoiceNumber = extra.invoiceNumber;
        pdf = await getAdditionalInvoicePdf(params.id);
      }
    }

    if (!dealId) return fail("not_found", "Invoice not found", 404);

    const deal = await findDeal(dealId);
    if (deal && !tokenHasResource(auth.token, "closer", deal.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    if (!pdf) return fail("not_found", "This invoice has no stored PDF", 404);

    return respondBlob(request, {
      fileName: `${invoiceNumber ?? params.id}.pdf`,
      contentType: "application/pdf",
      data: pdf,
    });
  } catch (err) {
    console.error("GET /api/v1/closer/deal-invoices/[id]/pdf error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
