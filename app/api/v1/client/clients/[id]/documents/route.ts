export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { readDocumentsByBrand } from "@/lib/payoutDocuments";

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

  const documents = await readDocumentsByBrand(user.payoutBrand ?? user.displayName);
  return ok({
    invoices: documents.filter((d) => d.docType === "invoice"),
    scopes: documents.filter((d) => d.docType === "project_scope"),
  });
}
