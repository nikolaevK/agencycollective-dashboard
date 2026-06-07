"use server";

import crypto from "crypto";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";
import {
  insertDocument,
  findDocument,
  deleteDocument,
  updateDocumentMeta,
  setDocumentImportant,
  isMediaDocType,
  isMediaPlatform,
  normalizeTags,
  MAX_MEDIA_DOC_SIZE_BYTES,
} from "@/lib/mediaDocuments";
import type {
  MediaDocument,
  MediaDocType,
  MediaPlatform,
} from "@/lib/mediaDocuments";
import {
  acknowledgeDocument,
  unacknowledgeDocument,
  deleteReadsForDocument,
} from "@/lib/mediaReads";
import { normalizeFolderName } from "@/lib/mediaFolders";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Any media-buyer (read/create). Returns session + admin or null. */
async function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { session, admin };
}

/** Head of Paid Media only (destructive actions). */
async function requireMediaManager() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media_manage) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { session, admin };
}

function actorName(session: { displayName: string | null; username: string }): string {
  return session.displayName ?? session.username;
}

// ---------------------------------------------------------------------------
// Upload (PDF)
// ---------------------------------------------------------------------------

export async function uploadMediaDocumentAction(
  formData: FormData
): Promise<{ data?: MediaDocument; error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const file = formData.get("file") as File | null;
  const folderRaw = String(formData.get("folder") ?? "general").trim();
  const docTypeRaw = String(formData.get("docType") ?? "other").trim();
  const platformRaw = String(formData.get("platform") ?? "").trim();
  const tagsRaw = formData.get("tags");
  let tags: string[] = [];
  if (typeof tagsRaw === "string" && tagsRaw) {
    try { tags = normalizeTags(JSON.parse(tagsRaw)); } catch { tags = []; }
  }

  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > MAX_MEDIA_DOC_SIZE_BYTES)
    return { error: "File too large (max 10 MB)" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (ext !== "pdf") return { error: "Only PDF files are allowed" };

  const docType: MediaDocType = isMediaDocType(docTypeRaw) ? docTypeRaw : "other";
  const platform: MediaPlatform | null = isMediaPlatform(platformRaw) ? platformRaw : null;
  const folder = normalizeFolderName(folderRaw) || "general";

  const id = crypto.randomUUID();
  const fileData = Buffer.from(await file.arrayBuffer());
  // Verify it's actually a PDF, not just a renamed file (served back as
  // application/pdf). Cheap magic-byte check beyond the extension.
  if (fileData.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { error: "File is not a valid PDF" };
  }
  const now = new Date().toISOString();

  const doc: MediaDocument = {
    id,
    folder,
    docType,
    platform,
    fileName: file.name,
    mimeType: "application/pdf",
    fileSize: file.size,
    important: false,
    tags,
    uploadedBy: auth.session.adminId,
    uploadedByName: actorName(auth.session),
    updatedAt: now,
    createdAt: now,
  };

  await insertDocument(doc, fileData);

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_document.upload",
      targetType: "media_document",
      targetId: id,
      details: JSON.stringify({ fileName: file.name, folder, docType, platform }),
    });
  } catch {
    // audit is fire-and-forget
  }

  return { data: doc };
}

// ---------------------------------------------------------------------------
// Save AI-generated document (markdown)
// ---------------------------------------------------------------------------

export async function saveGeneratedDocumentAction(input: {
  fileName: string;
  markdown: string;
  docType?: string;
  folder?: string;
  platform?: string;
}): Promise<{ data?: MediaDocument; error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const markdown = String(input.markdown ?? "");
  if (!markdown.trim()) return { error: "No content to save" };

  const bytes = Buffer.from(markdown, "utf8");
  if (bytes.length > MAX_MEDIA_DOC_SIZE_BYTES)
    return { error: "Document too large (max 10 MB)" };

  let fileName = String(input.fileName ?? "").trim() || "Untitled document";
  // Strip path separators; ensure a .md extension for the directory.
  fileName = fileName.replace(/[/\\]/g, "-").slice(0, 200);
  if (!fileName.toLowerCase().endsWith(".md")) fileName = `${fileName}.md`;

  const docTypeRaw = String(input.docType ?? "other").trim();
  const platformRaw = String(input.platform ?? "").trim();
  const docType: MediaDocType = isMediaDocType(docTypeRaw) ? docTypeRaw : "other";
  const platform: MediaPlatform | null = isMediaPlatform(platformRaw) ? platformRaw : null;
  const folder = (String(input.folder ?? "").trim() || "AI Generated");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const doc: MediaDocument = {
    id,
    folder,
    docType,
    platform,
    fileName,
    mimeType: "text/markdown",
    fileSize: bytes.length,
    important: false,
    tags: [],
    uploadedBy: auth.session.adminId,
    uploadedByName: actorName(auth.session),
    updatedAt: now,
    createdAt: now,
  };

  await insertDocument(doc, bytes);

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_document.generated",
      targetType: "media_document",
      targetId: id,
      details: JSON.stringify({ fileName, folder, docType }),
    });
  } catch {
    // audit is fire-and-forget
  }

  return { data: doc };
}

// ---------------------------------------------------------------------------
// Edit (rename / move / re-tag)
// ---------------------------------------------------------------------------

export async function updateMediaDocumentAction(
  id: string,
  changes: { fileName?: string; folder?: string; docType?: string; platform?: string | null; tags?: unknown }
): Promise<{ error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const existing = await findDocument(id);
  if (!existing) return { error: "Document not found" };

  const patch: Parameters<typeof updateDocumentMeta>[1] = {};
  if (changes.tags !== undefined) {
    patch.tags = normalizeTags(changes.tags);
  }
  if (changes.fileName !== undefined) {
    const name = String(changes.fileName).replace(/[/\\]/g, "-").trim().slice(0, 200);
    if (!name) return { error: "Name cannot be empty" };
    patch.fileName = name;
  }
  if (changes.folder !== undefined) {
    patch.folder = normalizeFolderName(String(changes.folder)) || "general";
  }
  if (changes.docType !== undefined) {
    const dt = String(changes.docType).trim();
    if (!isMediaDocType(dt)) return { error: "Invalid document type" };
    patch.docType = dt;
  }
  if (changes.platform !== undefined) {
    if (changes.platform === null || changes.platform === "") {
      patch.platform = null;
    } else {
      const pl = String(changes.platform).trim();
      if (!isMediaPlatform(pl)) return { error: "Invalid platform" };
      patch.platform = pl;
    }
  }

  await updateDocumentMeta(id, patch);

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_document.edit",
      targetType: "media_document",
      targetId: id,
      details: JSON.stringify({ fileName: existing.fileName, changes: patch }),
    });
  } catch {
    // audit is fire-and-forget
  }

  return {};
}

// ---------------------------------------------------------------------------
// Delete (Head of Paid Media only)
// ---------------------------------------------------------------------------

export async function deleteMediaDocumentAction(
  id: string
): Promise<{ error?: string }> {
  const auth = await requireMediaManager();
  if (!auth) return { error: "Forbidden" };

  const doc = await findDocument(id);
  if (!doc) return { error: "Document not found" };

  await deleteDocument(id);
  await deleteReadsForDocument(id); // no FK cascade in libSQL — clean receipts

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_document.delete",
      targetType: "media_document",
      targetId: id,
      details: JSON.stringify({ fileName: doc.fileName, folder: doc.folder }),
    });
  } catch {
    // audit is fire-and-forget
  }

  return {};
}

// ---------------------------------------------------------------------------
// Mark important (Head of Paid Media only)
// ---------------------------------------------------------------------------

export async function setDocumentImportantAction(
  id: string,
  important: boolean
): Promise<{ error?: string }> {
  const auth = await requireMediaManager();
  if (!auth) return { error: "Forbidden" };

  const doc = await findDocument(id);
  if (!doc) return { error: "Document not found" };

  await setDocumentImportant(id, important);

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_document.important",
      targetType: "media_document",
      targetId: id,
      details: JSON.stringify({ fileName: doc.fileName, important }),
    });
  } catch {
    /* fire-and-forget */
  }
  return {};
}

// ---------------------------------------------------------------------------
// Acknowledge ("I read this") — any media buyer, records the session user
// ---------------------------------------------------------------------------

export async function acknowledgeDocumentAction(
  id: string
): Promise<{ error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const doc = await findDocument(id);
  if (!doc) return { error: "Document not found" };

  const { newlyAcked } = await acknowledgeDocument(id, auth.session.adminId, actorName(auth.session));

  if (newlyAcked) {
    try {
      await logAuditEvent({
        adminId: auth.session.adminId,
        adminUsername: auth.session.username,
        action: "media_document.read",
        targetType: "media_document",
        targetId: id,
        details: JSON.stringify({ fileName: doc.fileName }),
      });
    } catch {
      /* fire-and-forget */
    }
  }
  return {};
}

export async function unacknowledgeDocumentAction(
  id: string
): Promise<{ error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };
  await unacknowledgeDocument(id, auth.session.adminId);
  return {};
}
