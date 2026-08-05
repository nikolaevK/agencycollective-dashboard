export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { readDocumentsByBrand } from "@/lib/payoutDocuments";
import { normalizeBrandName } from "@/lib/payouts";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Client documents (brand-matched payout docs), split into invoices and
 * scopes. Read + download only — ad-hoc upload is excluded from v1.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const user = await findUser(params.id);
  if (!user) return fail("not_found", "Client not found", 404);

  let documents = await readDocumentsByBrand(user.payoutBrand ?? user.displayName);
  // Cross-book isolation (mirrors the admin route): a non-main client's docs
  // are its own book's filings PLUS exact matches on the internally-managed
  // payout-brand link (deal imports / Payout Tracker uploads are stamped
  // 'main'). Fuzzy display-name matches never cross books.
  if (user.workspace !== "main") {
    const linkNorm = user.payoutBrand ? normalizeBrandName(user.payoutBrand) : "";
    documents = documents.filter(
      (d) =>
        d.workspace === user.workspace ||
        (linkNorm !== "" && d.normalizedBrand === linkNorm)
    );
  }
  return ok({
    invoices: documents.filter((d) => d.docType === "invoice"),
    scopes: documents.filter((d) => d.docType === "project_scope"),
  });
}
