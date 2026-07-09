export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, paginate } from "@/lib/api/respond";
import { readUpload } from "@/lib/api/files";
import {
  listDocuments,
  insertDocument,
  normalizeTags,
  isMediaDocType,
  isMediaPlatform,
  MAX_MEDIA_DOC_SIZE_BYTES,
  type MediaDocument,
} from "@/lib/mediaDocuments";
import { normalizeFolderName } from "@/lib/mediaFolders";
import { countReadsByDocument } from "@/lib/mediaReads";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** List media documents. Filters: ?folder&docType&platform, paginated. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "media:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder") ?? undefined;
    const docTypeRaw = url.searchParams.get("docType");
    const platformRaw = url.searchParams.get("platform");
    if (docTypeRaw && !isMediaDocType(docTypeRaw)) {
      return fail("invalid_request", "Invalid docType", 400);
    }
    if (platformRaw && !isMediaPlatform(platformRaw)) {
      return fail("invalid_request", "Invalid platform", 400);
    }

    const [documents, readCounts] = await Promise.all([
      listDocuments({
        folder,
        docType: docTypeRaw && isMediaDocType(docTypeRaw) ? docTypeRaw : undefined,
        platform: platformRaw && isMediaPlatform(platformRaw) ? platformRaw : undefined,
      }),
      countReadsByDocument(),
    ]);

    const enriched = documents.map((doc) => ({
      ...doc,
      ackCount: readCounts.get(doc.id) ?? 0,
    }));
    const { items, pagination } = paginate(enriched, parsePagination(url));
    return okList(items, pagination);
  } catch (err) {
    console.error("GET /api/v1/media/documents error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Upload a PDF — multipart form (file, folder?, docType?, platform?, tags?)
 * or JSON ({ fileBase64, fileName, ...same fields }). Replicates the
 * cookie-session upload action's validation — size cap, .pdf extension,
 * %PDF- magic byte — without touching the action itself.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "media:write");
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
    if (file.buffer.length > MAX_MEDIA_DOC_SIZE_BYTES) {
      return fail("payload_too_large", "File too large (max 10 MB)", 413);
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") {
      return fail("invalid_request", "Only PDF files are allowed", 400);
    }

    const docTypeRaw = String(payload.get("docType") ?? "other");
    const platformRaw = payload.get("platform") ?? "";
    const folderRaw = String(payload.get("folder") ?? "general");
    let tags: string[] = [];
    const tagsRaw = payload.get("tags");
    if (typeof tagsRaw === "string" && tagsRaw) {
      try {
        tags = normalizeTags(JSON.parse(tagsRaw));
      } catch {
        return fail("invalid_request", "tags must be a JSON string array", 400);
      }
    }

    const fileData = file.buffer;
    if (fileData.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return fail("invalid_request", "File is not a valid PDF", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const doc: MediaDocument = {
      id: crypto.randomUUID(),
      folder: normalizeFolderName(folderRaw) || "general",
      docType: isMediaDocType(docTypeRaw) ? docTypeRaw : "other",
      platform: isMediaPlatform(platformRaw) ? platformRaw : null,
      fileName: file.name,
      mimeType: "application/pdf",
      fileSize: fileData.length,
      important: false,
      tags,
      uploadedBy: actor.adminId,
      uploadedByName: actor.adminUsername,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await insertDocument(doc, fileData);

    logAuditEvent({
      ...actor,
      action: "media_document.upload",
      targetType: "media_document",
      targetId: doc.id,
      details: JSON.stringify({
        fileName: doc.fileName,
        folder: doc.folder,
        docType: doc.docType,
        platform: doc.platform,
      }),
    }).catch(() => {});

    return ok(doc, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/media/documents error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
