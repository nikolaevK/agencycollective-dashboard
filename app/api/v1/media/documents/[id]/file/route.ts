export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob } from "@/lib/api/files";
import { findDocumentWithData } from "@/lib/mediaDocuments";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Serve the stored file bytes. `?view=1` renders inline instead of download;
 * `?format=base64` returns JSON { fileName, contentType, size, dataBase64 }.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "media:read");
  if (!auth.ok) return auth.response;

  try {
    const result = await findDocumentWithData(params.id);
    if (!result) return fail("not_found", "Document not found", 404);

    const { doc, fileData } = result;
    return respondBlob(request, {
      fileName: doc.fileName,
      contentType: doc.mimeType,
      data: fileData,
    });
  } catch (err) {
    console.error("GET /api/v1/media/documents/[id]/file error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
