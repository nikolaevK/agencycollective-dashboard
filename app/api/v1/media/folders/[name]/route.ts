export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  folderExists,
  renameFolder,
  upsertFolder,
  deleteFolder,
  getFolderColor,
  isFolderColor,
} from "@/lib/mediaFolders";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Rename and/or recolor: { newName?, color? }. */
export async function PATCH(
  request: Request,
  { params }: { params: { name: string } }
) {
  const auth = await authenticateApiRequest(request, "media:write");
  if (!auth.ok) return auth.response;

  try {
    const name = decodeURIComponent(params.name);
    if (!(await folderExists(name))) {
      return fail("not_found", "Folder not found", 404);
    }

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const actor = tokenAuditActor(auth.token);
    let currentName = name;

    if (body.color !== undefined) {
      const color = String(body.color);
      if (!isFolderColor(color)) return fail("invalid_request", "Invalid color", 400);
      const result = await upsertFolder(currentName, color, actor.adminId, actor.adminUsername);
      if ("error" in result) return fail("invalid_request", result.error, 400);
      logAuditEvent({
        ...actor,
        action: "media_folder.recolor",
        targetType: "media_folder",
        targetId: currentName,
        details: JSON.stringify({ color }),
      }).catch(() => {});
    }

    if (body.newName !== undefined) {
      const result = await renameFolder(currentName, String(body.newName));
      if ("error" in result) {
        const status = /already exists/i.test(result.error) ? 409 : 400;
        return fail(status === 409 ? "conflict" : "invalid_request", result.error, status);
      }
      logAuditEvent({
        ...actor,
        action: "media_folder.rename",
        targetType: "media_folder",
        targetId: result.name,
        details: JSON.stringify({ from: currentName, to: result.name }),
      }).catch(() => {});
      currentName = result.name;
    }

    if (body.color === undefined && body.newName === undefined) {
      return fail("invalid_request", "Provide `newName` and/or `color`", 400);
    }

    const color = await getFolderColor(currentName);
    return ok({ name: currentName, color });
  } catch (err) {
    console.error("PATCH /api/v1/media/folders/[name] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Delete an empty folder — 409 if it still contains documents. */
export async function DELETE(
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

    const result = await deleteFolder(name);
    if (result.error) {
      const status = /not empty/i.test(result.error) ? 409 : 400;
      return fail(status === 409 ? "conflict" : "invalid_request", result.error, status);
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "media_folder.delete",
      targetType: "media_folder",
      targetId: name,
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/media/folders/[name] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
