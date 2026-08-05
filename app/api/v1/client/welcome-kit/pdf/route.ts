export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { tokenIsExternal } from "@/lib/apiScopes";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { respondBlob, readUpload } from "@/lib/api/files";
import {
  getWelcomeKitPdf,
  setWelcomeKitPdf,
  clearWelcomeKitPdf,
  MAX_WELCOME_KIT_PDF_BYTES,
} from "@/lib/welcomeKit";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Download the kit's attached PDF. `?format=base64` returns JSON. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }

  const pdf = await getWelcomeKitPdf();
  if (!pdf) return fail("not_found", "No PDF attached to the Welcome Kit", 404);

  return respondBlob(request, {
    fileName: pdf.name,
    contentType: "application/pdf",
    data: pdf.data,
  });
}

/**
 * Upload/replace the kit PDF — multipart form (file) or JSON
 * ({ fileBase64, fileName }) — PDF ≤10 MB.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }

  try {
    const payload = await readUpload(request);
    const file = payload?.file;
    if (!file) return fail("invalid_request", "No file provided", 400);
    if (file.buffer.length > MAX_WELCOME_KIT_PDF_BYTES) {
      return fail("payload_too_large", "File too large (max 10 MB)", 413);
    }
    const data = file.buffer;
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return fail("invalid_request", "File is not a valid PDF", 400);
    }

    await setWelcomeKitPdf(data, file.name, data.length);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "welcome_kit.pdf_upload",
      targetType: "welcome_kit",
      targetId: "welcome_kit",
      details: JSON.stringify({ name: file.name, size: data.length }),
    }).catch(() => {});

    return ok({ uploaded: true, name: file.name, size: data.length }, undefined, {
      status: 201,
    });
  } catch (err) {
    console.error("POST /api/v1/client/welcome-kit/pdf error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Destructive (wipes the stored PDF) — requires `client:delete`. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }

  try {
    await clearWelcomeKitPdf();

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "welcome_kit.pdf_clear",
      targetType: "welcome_kit",
      targetId: "welcome_kit",
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/welcome-kit/pdf error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
