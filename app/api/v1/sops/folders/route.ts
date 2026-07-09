export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  listSopFolders,
  upsertSopFolder,
  isFolderColor,
  DEFAULT_FOLDER_COLOR,
} from "@/lib/sopFolders";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "sops:read");
  if (!auth.ok) return auth.response;

  const folders = await listSopFolders();
  return ok(folders);
}

/** Create (or recolor/re-icon via upsert) a folder: { name, color?, icon? }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "sops:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body || typeof body.name !== "string") {
      return fail("invalid_request", "Body must include a `name` string", 400);
    }
    const colorRaw = body.color != null ? String(body.color) : DEFAULT_FOLDER_COLOR;
    const color = isFolderColor(colorRaw) ? colorRaw : DEFAULT_FOLDER_COLOR;
    const icon = body.icon != null ? String(body.icon) : null;

    const result = await upsertSopFolder(body.name, color, icon);
    if ("error" in result) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "sop_folder.create",
      targetType: "sop_folder",
      targetId: result.name,
      details: JSON.stringify({ color, icon }),
    }).catch(() => {});

    return ok(result, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/sops/folders error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
