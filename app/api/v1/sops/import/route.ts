export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readUpload } from "@/lib/api/files";
import { extractDocumentText } from "@/lib/sopDocumentText";
import { markdownToSopDoc } from "@/lib/sopMarkdown";
import { createSop } from "@/lib/sop";
import { logAuditEvent } from "@/lib/auditLog";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Deterministic (non-AI) SOP import. Multipart form: `file` (pdf/docx/html/
 * md/txt, ≤10 MB) — or JSON { fileBase64, fileName } — plus optional
 * `folder`, `create` ("1"/"true" persists the extracted doc immediately).
 * Without `create` it returns { doc, sourceName } for the caller to review
 * and POST to /api/v1/sops.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "sops:write");
  if (!auth.ok) return auth.response;

  try {
    const payload = await readUpload(request);
    if (!payload) {
      return fail(
        "invalid_request",
        "Expected multipart/form-data with a `file` field, or JSON with `fileBase64`",
        400
      );
    }
    const file = payload.file;
    if (!file) return fail("invalid_request", "No file provided", 400);
    if (file.buffer.length > MAX_FILE_BYTES) {
      return fail("payload_too_large", "File exceeds the 10 MB limit", 413);
    }

    const buffer = file.buffer;
    const extracted = await extractDocumentText(buffer, file.name, file.type);
    if (!extracted.ok) {
      return fail("invalid_request", extracted.error, extracted.status);
    }
    if (!extracted.text.trim()) {
      return fail("invalid_request", "No readable text found in this file", 422);
    }

    const fallbackTitle = file.name.replace(/\.[^.]+$/, "") || "Imported SOP";
    const doc = markdownToSopDoc(extracted.text, fallbackTitle);

    const createFlag = String(payload.get("create") ?? "").toLowerCase();
    if (createFlag === "1" || createFlag === "true") {
      const actor = tokenAuditActor(auth.token);
      const folder = payload.get("folder");
      const record = await createSop(
        {
          rawDoc: doc,
          folder: folder != null ? String(folder) : undefined,
          status: "draft",
        },
        actor.adminId
      );
      logAuditEvent({
        ...actor,
        action: "sop.create",
        targetType: "sop",
        targetId: record.id,
        details: JSON.stringify({ title: record.title, importedFrom: file.name }),
      }).catch(() => {});
      return ok({ doc: record.doc, sourceName: file.name, record }, undefined, { status: 201 });
    }

    return ok({ doc, sourceName: file.name });
  } catch (err) {
    console.error("POST /api/v1/sops/import error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
