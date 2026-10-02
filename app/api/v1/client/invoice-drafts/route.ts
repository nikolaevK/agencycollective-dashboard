export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { okList, fail, corsPreflight, parsePagination } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import {
  listVisibleInvoiceDrafts,
  INVOICE_DRAFT_KINDS,
  INVOICE_DRAFT_STATUSES,
  type InvoiceDraftKind,
  type InvoiceDraftStatus,
} from "@/lib/invoiceDrafts";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * List invoice drafts (client re-bill + ad-account). Filters: `status`
 * (pending | sent | rejected; default all), `kind`, `clientId`, `adAccountId`.
 * Rows omit the full invoiceData — fetch one with getInvoiceDraft.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const sp = url.searchParams;
    const rawStatus = sp.get("status");
    if (rawStatus && !INVOICE_DRAFT_STATUSES.includes(rawStatus as InvoiceDraftStatus)) {
      return fail("invalid_request", "status must be pending, sent or rejected", 400);
    }
    const rawKind = sp.get("kind");
    if (rawKind && !INVOICE_DRAFT_KINDS.includes(rawKind as InvoiceDraftKind)) {
      return fail("invalid_request", "kind must be client_rebill or ad_account", 400);
    }
    const allowed = allowedResourceIds(auth.token, "client");
    const page = parsePagination(url);
    const { items, total } = await listVisibleInvoiceDrafts(
      {
        status: (rawStatus as InvoiceDraftStatus | null) ?? undefined,
        kind: (rawKind as InvoiceDraftKind | null) ?? undefined,
        ownerUserId: sp.get("clientId") ?? undefined,
        adAccountId: sp.get("adAccountId") ?? undefined,
      },
      (t) => !allowed || (t.ownerUserId !== null && allowed.includes(t.ownerUserId)),
      page
    );
    return okList(items, { total, ...page });
  } catch (err) {
    console.error("GET /api/v1/client/invoice-drafts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
