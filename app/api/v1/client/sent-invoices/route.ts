export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { buildClientDirectory } from "@/lib/clientDirectory";

export function OPTIONS() {
  return corsPreflight();
}

/** Re-bill invoices currently awaiting payment (reconciled on read). */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    const rows = await buildClientDirectory();
    const allowed = allowedResourceIds(auth.token, "client");

    const invoices = rows
      .filter(
        (r) =>
          (!allowed || allowed.includes(r.id)) && r.activeSentInvoice !== null
      )
      .map((r) => ({
        userId: r.id,
        displayName: r.displayName,
        invoice: r.activeSentInvoice,
      }))
      .sort((a, b) =>
        String(b.invoice?.sentAt ?? "").localeCompare(String(a.invoice?.sentAt ?? ""))
      );

    return ok({ invoices, count: invoices.length });
  } catch (err) {
    console.error("GET /api/v1/client/sent-invoices error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
