export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob, readUpload } from "@/lib/api/files";
import { findUser, getUserLogo, setUserLogo, clearUserLogo } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function OPTIONS() {
  return corsPreflight();
}

/** Serve the stored logo bytes. `?format=base64` returns JSON. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const logo = await getUserLogo(params.id);
  if (!logo) return fail("not_found", "No logo stored for this client", 404);

  const ext = logo.contentType.split("/").pop() ?? "png";
  return respondBlob(request, {
    fileName: `logo.${ext === "jpeg" ? "jpg" : ext}`,
    contentType: logo.contentType,
    data: logo.data,
    inline: true,
  });
}

/**
 * Upload a logo — multipart form (file) or JSON ({ fileBase64, contentType })
 * — png/jpg/webp ≤2 MB, Turso BLOB.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    const payload = await readUpload(request);
    const file = payload?.file;
    if (!file) return fail("invalid_request", "No file provided", 400);
    if (file.buffer.length > MAX_LOGO_BYTES) {
      return fail("payload_too_large", "Logo too large (max 2 MB)", 413);
    }
    if (!ALLOWED_TYPES[file.type]) {
      return fail("invalid_request", "Logo must be png, jpg, or webp (set contentType)", 400);
    }

    const data = file.buffer;
    const logoPath = `/api/clients/${params.id}/logo?v=${Date.now()}`;
    await setUserLogo(params.id, data, file.type, logoPath);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.logo_upload",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ size: data.length, type: file.type }),
    }).catch(() => {});

    return ok({ uploaded: true, logoPath }, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients/[id]/logo error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Destructive (wipes the stored logo) — requires `client:delete`. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:delete", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    await clearUserLogo(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.logo_clear",
      targetType: "client",
      targetId: params.id,
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/clients/[id]/logo error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
