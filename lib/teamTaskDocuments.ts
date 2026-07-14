import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Team task attachments — PDF BLOBs ≤10 MB in team_task_documents (the
// payout_documents pattern: Vercel FS is read-only, so bytes live DB-side).
// List reads are metadata-only AND forced onto the covering index
// idx_team_task_documents_meta (lib/db.ts): columns read from a blob-bearing
// row walk the blob's overflow pages, and Turso disallows ANALYZE so the
// planner never picks the covering index unaided (the media_documents fix).
// The BLOB itself is fetched one row at a time.
// ---------------------------------------------------------------------------

export const MAX_TASK_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Metadata columns (excludes the data BLOB). */
const META_COLUMNS = "id, task_id, file_name, file_size, uploaded_by, uploaded_by_name, created_at";

export interface TeamTaskDocument {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

function rowToDocument(row: Row): TeamTaskDocument {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    fileName: String(row.file_name),
    fileSize: Number(row.file_size ?? 0),
    uploadedBy: row.uploaded_by != null ? String(row.uploaded_by) : null,
    uploadedByName: row.uploaded_by_name != null ? String(row.uploaded_by_name) : null,
    createdAt: String(row.created_at || ""),
  };
}

function blobToBuffer(raw: unknown): Buffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  console.error("[teamTaskDocuments] Unexpected BLOB type:", typeof raw);
  return null;
}

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

/**
 * Metadata reads via the covering index; falls back to the natural plan when
 * the index doesn't exist yet (fresh DB first run — mediaDocuments pattern).
 */
async function selectMetaRows(suffix: string, args: string[]): Promise<Row[]> {
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `SELECT ${META_COLUMNS} FROM team_task_documents
            INDEXED BY idx_team_task_documents_meta ${suffix}`,
      args,
    });
    return [...result.rows];
  } catch {
    const result = await db.execute({
      sql: `SELECT ${META_COLUMNS} FROM team_task_documents ${suffix}`,
      args,
    });
    return [...result.rows];
  }
}

export async function listTaskDocuments(taskId: string): Promise<TeamTaskDocument[]> {
  await ensureMigrated();
  try {
    const rows = await selectMetaRows("WHERE task_id = ? ORDER BY created_at", [taskId]);
    return rows.map(rowToDocument);
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

export async function insertTaskDocument(input: {
  taskId: string;
  fileName: string;
  data: Buffer;
  uploadedBy: string | null;
  uploadedByName: string | null;
}): Promise<TeamTaskDocument> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO team_task_documents
            (id, task_id, file_name, file_size, data, uploaded_by, uploaded_by_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.taskId,
      input.fileName.slice(0, 300),
      input.data.length,
      input.data,
      input.uploadedBy,
      input.uploadedByName,
    ],
  });
  const rows = await selectMetaRows("WHERE id = ?", [id]);
  return rowToDocument(rows[0]);
}

export async function findTaskDocument(id: string): Promise<TeamTaskDocument | null> {
  await ensureMigrated();
  try {
    const rows = await selectMetaRows("WHERE id = ?", [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
}

export async function findTaskDocumentWithData(
  id: string
): Promise<{ doc: TeamTaskDocument; data: Buffer } | null> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `SELECT ${META_COLUMNS}, data FROM team_task_documents WHERE id = ?`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const data = blobToBuffer(row.data);
    if (!data) return null;
    return { doc: rowToDocument(row), data };
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
}

export async function deleteTaskDocument(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM team_task_documents WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
