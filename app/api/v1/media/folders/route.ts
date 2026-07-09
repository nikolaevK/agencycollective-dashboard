export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  listFoldersWithColors,
  upsertFolder,
  isFolderColor,
  DEFAULT_FOLDER_COLOR,
} from "@/lib/mediaFolders";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "media:read");
  if (!auth.ok) return auth.response;

  const folders = await listFoldersWithColors();
  return ok(folders);
}

/** Create (or recolor via upsert) a folder: { name, color? }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "media:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body || typeof body.name !== "string") {
      return fail("invalid_request", "Body must include a `name` string", 400);
    }
    const colorRaw = body.color != null ? String(body.color) : DEFAULT_FOLDER_COLOR;
    const color = isFolderColor(colorRaw) ? colorRaw : DEFAULT_FOLDER_COLOR;

    const actor = tokenAuditActor(auth.token);
    const result = await upsertFolder(body.name, color, actor.adminId, actor.adminUsername);
    if ("error" in result) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...actor,
      action: "media_folder.create",
      targetType: "media_folder",
      targetId: result.name,
      details: JSON.stringify({ color }),
    }).catch(() => {});

    return ok(result, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/media/folders error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
