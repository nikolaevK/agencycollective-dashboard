export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { getClientDetail } from "@/lib/clientDirectory";
import {
  generateClientInvoiceData,
  generateClientInvoiceNumber,
} from "@/lib/clientInvoice";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Prefilled re-bill invoice draft seeded from the client's payout MRR.
 * `?paymentType=local|international` swaps the payment block. Draft only —
 * sending email is excluded from v1 (use /billing/invoices/register to
 * record an out-of-band send).
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const detail = await getClientDetail(params.id);
    if (!detail) return fail("not_found", "Client not found", 404);

    const paymentType =
      new URL(request.url).searchParams.get("paymentType") === "international"
        ? "international"
        : "local";

    const invoiceData = await generateClientInvoiceData({
      clientName: detail.row.displayName,
      clientEmail: detail.row.email,
      amountCents: detail.row.payoutMrr,
      serviceName: detail.history[0]?.service ?? null,
      invoiceNumber: generateClientInvoiceNumber(),
      paymentType,
    });

    return ok({
      invoiceData,
      brand: detail.row.matchedBrand ?? detail.row.displayName,
    });
  } catch (err) {
    console.error("GET /api/v1/client/clients/[id]/billing/invoice/prefill error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
