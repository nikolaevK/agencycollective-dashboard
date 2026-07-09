export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  listSopFolders,
  renameSopFolder,
  upsertSopFolder,
  deleteSopFolder,
  isFolderColor,
} from "@/lib/sopFolders";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Rename and/or restyle: { newName?, color?, icon? }. */
export async function PATCH(
  request: Request,
  { params }: { params: { name: string } }
) {
  const auth = await authenticateApiRequest(request, "sops:write");
  if (!auth.ok) return auth.response;

  try {
    const name = decodeURIComponent(params.name);
    const folders = await listSopFolders();
    const existing = folders.find((f) => f.name === name);
    if (!existing) return fail("not_found", "Folder not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    if (body.newName === undefined && body.color === undefined && body.icon === undefined) {
      return fail("invalid_request", "Provide `newName`, `color`, and/or `icon`", 400);
    }

    const actor = tokenAuditActor(auth.token);
    let currentName = name;

    if (body.color !== undefined || body.icon !== undefined) {
      const color = body.color !== undefined ? String(body.color) : existing.color;
      if (!isFolderColor(color)) return fail("invalid_request", "Invalid color", 400);
      const icon =
        body.icon !== undefined
          ? body.icon != null
            ? String(body.icon)
            : null
          : existing.icon;
      const result = await upsertSopFolder(currentName, color, icon);
      if ("error" in result) return fail("invalid_request", result.error, 400);
      logAuditEvent({
        ...actor,
        action: "sop_folder.update",
        targetType: "sop_folder",
        targetId: currentName,
        details: JSON.stringify({ color, icon }),
      }).catch(() => {});
    }

    if (body.newName !== undefined) {
      if (currentName === "General") {
        return fail("invalid_request", "The default folder can't be renamed", 400);
      }
      const result = await renameSopFolder(currentName, String(body.newName));
      if ("error" in result) {
        const status = /already exists/i.test(result.error) ? 409 : 400;
        return fail(status === 409 ? "conflict" : "invalid_request", result.error, status);
      }
      logAuditEvent({
        ...actor,
        action: "sop_folder.rename",
        targetType: "sop_folder",
        targetId: result.name,
        details: JSON.stringify({ from: currentName, to: result.name }),
      }).catch(() => {});
      currentName = result.name;
    }

    const refreshed = (await listSopFolders()).find((f) => f.name === currentName);
    return ok(refreshed ?? { name: currentName });
  } catch (err) {
    console.error("PATCH /api/v1/sops/folders/[name] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Delete a folder — refuses `General` and non-empty folders (409). */
export async function DELETE(
  request: Request,
  { params }: { params: { name: string } }
) {
  const auth = await authenticateApiRequest(request, "sops:delete");
  if (!auth.ok) return auth.response;

  try {
    const name = decodeURIComponent(params.name);
    const result = await deleteSopFolder(name);
    if (result.error) {
      const status = /not empty/i.test(result.error) ? 409 : 400;
      return fail(status === 409 ? "conflict" : "invalid_request", result.error, status);
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "sop_folder.delete",
      targetType: "sop_folder",
      targetId: name,
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/sops/folders/[name] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
