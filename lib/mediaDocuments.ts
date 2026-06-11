import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Document categories the paid-media team works with. */
export const MEDIA_DOC_TYPES = [
  "sop",
  "creative_brief",
  "campaign_brief",
  "account_audit",
  "media_plan",
  "report",
  "post_mortem",
  "other",
] as const;
export type MediaDocType = (typeof MEDIA_DOC_TYPES)[number];

/** Ad platform a document relates to (optional tag). */
export const MEDIA_PLATFORMS = ["meta", "tiktok", "google", "cross"] as const;
export type MediaPlatform = (typeof MEDIA_PLATFORMS)[number];

/** Uploads are PDFs; AI-generated docs are markdown. */
export type MediaMimeType = "application/pdf" | "text/markdown";

export const MAX_MEDIA_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_TAGS_PER_DOC = 12;
export const MAX_TAG_LENGTH = 40;

/** Metadata columns (excludes file_data BLOB) */
const META_COLUMNS = `id, folder, doc_type, platform, file_name, mime_type,
  file_size, important, tags, uploaded_by, uploaded_by_name, updated_at, created_at`;

export interface MediaDocument {
  id: string;
  folder: string;
  docType: MediaDocType;
  platform: MediaPlatform | null;
  fileName: string;
  mimeType: MediaMimeType;
  fileSize: number;
  important: boolean;
  tags: string[];
  uploadedBy: string | null;
  uploadedByName: string | null;
  updatedAt: string;
  createdAt: string;
}

/** Clean a list of tags: trim, drop empties, cap length, dedupe (case-insensitive), cap count. */
export function normalizeTags(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of arr) {
    // Trim, collapse internal whitespace, cap length.
    const tag = String(t).trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_DOC) break;
  }
  return out;
}

function parseTags(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

export function isMediaDocType(value: string): value is MediaDocType {
  return (MEDIA_DOC_TYPES as readonly string[]).includes(value);
}

export function isMediaPlatform(value: string): value is MediaPlatform {
  return (MEDIA_PLATFORMS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToDocument(row: Row): MediaDocument {
  return {
    id: String(row.id),
    folder: String(row.folder ?? "general"),
    docType: String(row.doc_type ?? "other") as MediaDocType,
    platform: row.platform ? (String(row.platform) as MediaPlatform) : null,
    fileName: String(row.file_name),
    mimeType: String(row.mime_type ?? "application/pdf") as MediaMimeType,
    fileSize: Number(row.file_size ?? 0),
    important: Number(row.important ?? 0) === 1,
    tags: parseTags(row.tags),
    uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null,
    uploadedByName: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
    updatedAt: String(row.updated_at),
    createdAt: String(row.created_at),
  };
}

function blobToBuffer(raw: unknown): Buffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  console.error("[mediaDocuments] Unexpected BLOB type:", typeof raw);
  return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function insertDocument(
  doc: MediaDocument,
  fileData: Buffer
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO media_documents
            (id, folder, doc_type, platform, file_name, mime_type,
             file_size, tags, uploaded_by, uploaded_by_name, file_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      doc.id,
      doc.folder,
      doc.docType,
      doc.platform,
      doc.fileName,
      doc.mimeType,
      doc.fileSize,
      JSON.stringify(normalizeTags(doc.tags)),
      doc.uploadedBy,
      doc.uploadedByName,
      fileData,
    ],
  });
}

// Metadata reads are forced onto the covering index (ensureCriticalColumns):
// important/tags were ALTER-added AFTER the file_data BLOB, so reading them
// from the row walks each document's full PDF overflow chain — listing cost
// would grow linearly with total stored bytes. Turso disallows ANALYZE, so
// the planner never picks the covering index unaided; fall back to the
// natural plan if the index doesn't exist yet (fresh DB first run).
async function selectMetaRows(
  suffix: string,
  args: string[]
): Promise<Row[]> {
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `SELECT ${META_COLUMNS} FROM media_documents INDEXED BY idx_media_docs_meta_cover ${suffix}`,
      args,
    });
    return [...result.rows];
  } catch {
    const result = await db.execute({
      sql: `SELECT ${META_COLUMNS} FROM media_documents ${suffix}`,
      args,
    });
    return [...result.rows];
  }
}

export async function findDocument(id: string): Promise<MediaDocument | null> {
  await ensureMigrated();
  const rows = await selectMetaRows("WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  return rowToDocument(rows[0]);
}

export async function findDocumentWithData(
  id: string
): Promise<{ doc: MediaDocument; fileData: Buffer } | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT ${META_COLUMNS}, file_data FROM media_documents WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const fileData = blobToBuffer(row.file_data);
  if (!fileData) return null;
  return { doc: rowToDocument(row), fileData };
}

export async function deleteDocument(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM media_documents WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** Rename / re-tag / move a document. Only provided fields change; bumps updated_at. */
export async function updateDocumentMeta(
  id: string,
  changes: {
    fileName?: string;
    folder?: string;
    docType?: MediaDocType;
    platform?: MediaPlatform | null;
    tags?: string[];
  }
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const fields: string[] = [];
  const args: (string | null)[] = [];

  if (changes.fileName !== undefined) { fields.push("file_name = ?"); args.push(changes.fileName); }
  if (changes.folder !== undefined) { fields.push("folder = ?"); args.push(changes.folder); }
  if (changes.docType !== undefined) { fields.push("doc_type = ?"); args.push(changes.docType); }
  if (changes.platform !== undefined) { fields.push("platform = ?"); args.push(changes.platform); }
  if (changes.tags !== undefined) { fields.push("tags = ?"); args.push(JSON.stringify(normalizeTags(changes.tags))); }

  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  const result = await db.execute({
    sql: `UPDATE media_documents SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function setDocumentImportant(id: string, important: boolean): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "UPDATE media_documents SET important = ? WHERE id = ?",
    args: [important ? 1 : 0, id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function listDocuments(filters?: {
  folder?: string;
  docType?: MediaDocType;
  platform?: MediaPlatform;
}): Promise<MediaDocument[]> {
  await ensureMigrated();

  const where: string[] = [];
  const args: string[] = [];
  if (filters?.folder) { where.push("folder = ?"); args.push(filters.folder); }
  if (filters?.docType) { where.push("doc_type = ?"); args.push(filters.docType); }
  if (filters?.platform) { where.push("platform = ?"); args.push(filters.platform); }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await selectMetaRows(`${whereClause} ORDER BY updated_at DESC`, args);
  return rows.map(rowToDocument);
}

export async function listFolders(): Promise<string[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT DISTINCT folder FROM media_documents ORDER BY folder"
  );
  return result.rows.map((row) => String(row.folder ?? "general"));
}
