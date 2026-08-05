export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readUpload } from "@/lib/api/files";
import {
  readDocumentsByBrand,
  insertDocument,
  MAX_DOCUMENT_SIZE_BYTES,
  type PayoutDocument,
  type DocType,
} from "@/lib/payoutDocuments";
import { normalizeBrandName } from "@/lib/payouts";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Brand documents (fuzzy brand match): ?brand=<name> (required). */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const brand = new URL(request.url).searchParams.get("brand")?.trim();
  if (!brand) return fail("invalid_request", "brand query param is required", 400);

  const documents = await readDocumentsByBrand(brand);
  return ok(documents);
}

/**
 * Upload a brand document — multipart form (file [PDF ≤10 MB], brandName,
 * docType [project_scope|invoice], payoutMonth?, payoutYear?) or JSON
 * ({ fileBase64, fileName, ...same fields }).
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
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
    if (file.buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      return fail("payload_too_large", "File too large (max 10 MB)", 413);
    }
    const brandName = String(payload.get("brandName") ?? "").trim().slice(0, 500);
    if (!brandName) return fail("invalid_request", "brandName is required", 400);
    const docTypeRaw = String(payload.get("docType") ?? "");
    if (docTypeRaw !== "project_scope" && docTypeRaw !== "invoice") {
      return fail("invalid_request", "docType must be project_scope or invoice", 400);
    }

    const fileData = file.buffer;
    if (fileData.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return fail("invalid_request", "File is not a valid PDF", 400);
    }

    const monthRaw = Number(payload.get("payoutMonth"));
    const yearRaw = Number(payload.get("payoutYear"));
    const payoutMonth =
      Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
    const payoutYear =
      Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : null;

    const actor = tokenAuditActor(auth.token);
    const doc: PayoutDocument = {
      id: crypto.randomUUID(),
      normalizedBrand: normalizeBrandName(brandName),
      brandName,
      // v1 payout-doc uploads are internal tooling → main book.
      workspace: "main",
      docType: docTypeRaw as DocType,
      fileName: file.name,
      fileSize: fileData.length,
      payoutMonth,
      payoutYear,
      uploadedBy: actor.adminId,
      createdAt: new Date().toISOString(),
    };
    await insertDocument(doc, fileData);

    logAuditEvent({
      ...actor,
      action: "payout_document.upload",
      targetType: "payout_document",
      targetId: doc.id,
      details: JSON.stringify({ brandName, docType: doc.docType, fileName: doc.fileName }),
    }).catch(() => {});

    return ok(doc, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/payouts/documents error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
