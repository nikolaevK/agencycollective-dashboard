import { getDb, ensureMigrated } from "./db";
import { normalizeBrandName, brandsMatch } from "./payouts";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocType = "project_scope" | "invoice";

export interface PayoutDocument {
  id: string;
  normalizedBrand: string;
  brandName: string;
  docType: DocType;
  fileName: string;
  filePath: string;
  fileSize: number;
  payoutMonth: number | null;
  payoutYear: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToDocument(row: Row): PayoutDocument {
  return {
    id: String(row.id),
    normalizedBrand: String(row.normalized_brand),
    brandName: String(row.brand_name),
    docType: String(row.doc_type) as DocType,
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileSize: Number(row.file_size ?? 0),
    payoutMonth: row.payout_month != null ? Number(row.payout_month) : null,
    payoutYear: row.payout_year != null ? Number(row.payout_year) : null,
    uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null,
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function insertDocument(doc: PayoutDocument): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO payout_documents
            (id, normalized_brand, brand_name, doc_type, file_name, file_path,
             file_size, payout_month, payout_year, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      doc.id,
      doc.normalizedBrand,
      doc.brandName,
      doc.docType,
      doc.fileName,
      doc.filePath,
      doc.fileSize,
      doc.payoutMonth,
      doc.payoutYear,
      doc.uploadedBy,
    ],
  });
}

export async function findDocument(id: string): Promise<PayoutDocument | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM payout_documents WHERE id = ?", args: [id] });
  if (result.rows.length === 0) return null;
  return rowToDocument(result.rows[0]);
}

export async function deleteDocument(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM payout_documents WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Brand-level retrieval with fuzzy matching
// ---------------------------------------------------------------------------

export async function readDocumentsByBrand(brandName: string): Promise<PayoutDocument[]> {
  await ensureMigrated();
  const norm = normalizeBrandName(brandName);
  if (!norm) return [];

  const db = getDb();

  // Fetch all distinct normalized brands stored in the documents table
  const distinctResult = await db.execute("SELECT DISTINCT normalized_brand FROM payout_documents");
  const matchedBrands: string[] = [];
  for (const row of distinctResult.rows) {
    const stored = String(row.normalized_brand);
    if (brandsMatch(norm, stored)) {
      matchedBrands.push(stored);
    }
  }

  if (matchedBrands.length === 0) return [];

  // Build parameterised IN clause
  const placeholders = matchedBrands.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT * FROM payout_documents
          WHERE normalized_brand IN (${placeholders})
          ORDER BY created_at DESC`,
    args: matchedBrands,
  });

  return result.rows.map(rowToDocument);
}
