export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob } from "@/lib/api/files";
import { findUser } from "@/lib/users";
import { findDocumentWithData } from "@/lib/payoutDocuments";
import { normalizeBrandName, brandsMatch } from "@/lib/payouts";

export function OPTIONS() {
  return corsPreflight();
}

/** Download one client document — ownership enforced by fuzzy brand match. */
export async function GET(
  request: Request,
  { params }: { params: { id: string; docId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    const result = await findDocumentWithData(params.docId);
    if (!result) return fail("not_found", "Document not found", 404);

    const clientBrand = normalizeBrandName(user.payoutBrand ?? user.displayName);
    if (!brandsMatch(clientBrand, result.doc.normalizedBrand)) {
      return fail("not_found", "Document not found", 404);
    }

    return respondBlob(request, {
      fileName: result.doc.fileName,
      contentType: "application/pdf",
      data: result.fileData,
    });
  } catch (err) {
    console.error("GET /api/v1/client/clients/[id]/documents/[docId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
