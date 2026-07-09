export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { folderExists, setFolderImportant } from "@/lib/mediaFolders";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Manager-level in the app (`media_manage`) → requires `media:delete`. */
export async function PATCH(
  request: Request,
  { params }: { params: { name: string } }
) {
  const auth = await authenticateApiRequest(request, "media:delete");
  if (!auth.ok) return auth.response;

  try {
    const name = decodeURIComponent(params.name);
    if (!(await folderExists(name))) {
      return fail("not_found", "Folder not found", 404);
    }

    const body = await readJsonBody(request);
    if (!body || typeof body.important !== "boolean") {
      return fail("invalid_request", "Body must be { important: boolean }", 400);
    }

    const result = await setFolderImportant(name, body.important);
    if ("error" in result) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "media_folder.important",
      targetType: "media_folder",
      targetId: name,
      details: JSON.stringify({ important: body.important }),
    }).catch(() => {});

    return ok(result);
  } catch (err) {
    console.error("PATCH /api/v1/media/folders/[name]/important error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
