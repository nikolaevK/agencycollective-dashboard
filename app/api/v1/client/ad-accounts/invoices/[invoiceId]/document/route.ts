export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob } from "@/lib/api/files";
import { tokenHasResource } from "@/lib/apiScopes";
import { findAdAccountInvoice } from "@/lib/adAccountInvoices";
import { findDocumentWithData } from "@/lib/payoutDocuments";

export function OPTIONS() {
  return corsPreflight();
}

/** Download the PDF linked to an ad-account invoice. */
export async function GET(
  request: Request,
  { params }: { params: { invoiceId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    const invoice = await findAdAccountInvoice(params.invoiceId);
    if (!invoice) return fail("not_found", "Invoice not found", 404);
    if (!tokenHasResource(auth.token, "client", invoice.userId)) {
      return fail("resource_forbidden", "This token is not allowed to access this client", 403);
    }
    if (!invoice.payoutDocumentId) {
      return fail("not_found", "This invoice has no stored PDF", 404);
    }

    const result = await findDocumentWithData(invoice.payoutDocumentId);
    if (!result) return fail("not_found", "Stored PDF not found", 404);

    return respondBlob(request, {
      fileName: result.doc.fileName,
      contentType: "application/pdf",
      data: result.fileData,
    });
  } catch (err) {
    console.error("GET /api/v1/client/ad-accounts/invoices/[invoiceId]/document error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
