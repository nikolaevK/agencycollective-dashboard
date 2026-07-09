export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { findDocument } from "@/lib/mediaDocuments";
import { listReaders } from "@/lib/mediaReads";

export function OPTIONS() {
  return corsPreflight();
}

/** Manager-level in the app (`media_manage`) → requires `media:delete`. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:delete");
  if (!auth.ok) return auth.response;

  const doc = await findDocument(params.id);
  if (!doc) return fail("not_found", "Document not found", 404);

  const readers = await listReaders(params.id);
  return ok(readers);
}
