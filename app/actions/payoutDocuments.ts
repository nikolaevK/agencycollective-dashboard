"use server";

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { normalizeBrandName } from "@/lib/payouts";
import { insertDocument, findDocument, deleteDocument } from "@/lib/payoutDocuments";
import { logAuditEvent } from "@/lib/auditLog";
import type { DocType, PayoutDocument } from "@/lib/payoutDocuments";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads", "documents");

async function requireCloserAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.closers) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { session, admin };
}

export async function uploadPayoutDocumentAction(
  formData: FormData
): Promise<{ data?: PayoutDocument; error?: string }> {
  const auth = await requireCloserAdmin();
  if (!auth) return { error: "Unauthorized" };

  const file = formData.get("file") as File | null;
  const brandName = String(formData.get("brandName") ?? "").trim();
  const docType = String(formData.get("docType") ?? "").trim() as DocType;
  const monthStr = formData.get("payoutMonth");
  const yearStr = formData.get("payoutYear");

  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > MAX_BYTES) return { error: "File too large (max 10 MB)" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (ext !== "pdf") return { error: "Only PDF files are allowed" };

  if (!brandName) return { error: "Brand name is required" };
  if (docType !== "project_scope" && docType !== "invoice") {
    return { error: "Invalid document type" };
  }

  const payoutMonth = monthStr ? Number(monthStr) : null;
  const payoutYear = yearStr ? Number(yearStr) : null;

  if (payoutMonth != null && (payoutMonth < 1 || payoutMonth > 12)) {
    return { error: "Invalid month" };
  }
  if (payoutYear != null && (payoutYear < 2000 || payoutYear > 2100)) {
    return { error: "Invalid year" };
  }

  // Ensure upload directory exists
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const safeName = file.name
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 100);
  const filename = `${id}_${safeName}.pdf`;
  const filePath = path.join(UPLOAD_DIR, filename);

  const bytes = await file.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(bytes));

  const doc: PayoutDocument = {
    id,
    normalizedBrand: normalizeBrandName(brandName),
    brandName,
    docType,
    fileName: file.name,
    filePath: `data/uploads/documents/${filename}`,
    fileSize: file.size,
    payoutMonth,
    payoutYear,
    uploadedBy: auth.session.adminId,
    createdAt: new Date().toISOString(),
  };

  await insertDocument(doc);

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "payout_document.upload",
      targetType: "payout_document",
      targetId: id,
      details: JSON.stringify({ docType, fileName: file.name, brandName }),
    });
  } catch {
    // audit is fire-and-forget
  }

  return { data: doc };
}

export async function deletePayoutDocumentAction(
  documentId: string
): Promise<{ error?: string }> {
  const auth = await requireCloserAdmin();
  if (!auth) return { error: "Unauthorized" };

  const doc = await findDocument(documentId);
  if (!doc) return { error: "Document not found" };

  // Delete file from disk (with path traversal guard)
  try {
    const fullPath = path.resolve(process.cwd(), doc.filePath);
    if (fullPath.startsWith(UPLOAD_DIR) && fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // continue even if file removal fails
  }

  await deleteDocument(documentId);

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "payout_document.delete",
      targetType: "payout_document",
      targetId: documentId,
      details: JSON.stringify({ docType: doc.docType, fileName: doc.fileName, brandName: doc.brandName }),
    });
  } catch {
    // audit is fire-and-forget
  }

  return {};
}
