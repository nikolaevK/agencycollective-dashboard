import { getDb, ensureMigrated } from "./db";

export interface DocumentReader {
  adminId: string;
  adminName: string | null;
  readAt: string;
}

/** Record that an admin has read a document. Idempotent (one row per pair). */
export async function acknowledgeDocument(
  documentId: string,
  adminId: string,
  adminName: string | null
): Promise<{ newlyAcked: boolean }> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO media_document_reads (document_id, admin_id, admin_name)
          VALUES (?, ?, ?)
          ON CONFLICT(document_id, admin_id) DO NOTHING`,
    args: [documentId, adminId, adminName],
  });
  return { newlyAcked: (result.rowsAffected ?? 0) > 0 };
}

/** Remove an admin's acknowledgement of a document. */
export async function unacknowledgeDocument(documentId: string, adminId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM media_document_reads WHERE document_id = ? AND admin_id = ?",
    args: [documentId, adminId],
  });
}

/** Map of document_id → number of acknowledgements. */
export async function countReadsByDocument(): Promise<Map<string, number>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT document_id, COUNT(*) AS n FROM media_document_reads GROUP BY document_id"
  );
  const m = new Map<string, number>();
  for (const r of result.rows) m.set(String(r.document_id), Number(r.n ?? 0));
  return m;
}

/** Set of document ids the given admin has acknowledged. */
export async function docIdsAckedBy(adminId: string): Promise<Set<string>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT document_id FROM media_document_reads WHERE admin_id = ?",
    args: [adminId],
  });
  return new Set(result.rows.map((r) => String(r.document_id)));
}

/** Who has read a document (most recent first). */
export async function listReaders(documentId: string): Promise<DocumentReader[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT admin_id, admin_name, read_at
          FROM media_document_reads
          WHERE document_id = ?
          ORDER BY read_at DESC`,
    args: [documentId],
  });
  return result.rows.map((r) => ({
    adminId: String(r.admin_id),
    adminName: r.admin_name != null ? String(r.admin_name) : null,
    readAt: String(r.read_at),
  }));
}

/** Clean up read receipts when a document is deleted (no FK cascade in libSQL). */
export async function deleteReadsForDocument(documentId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM media_document_reads WHERE document_id = ?",
    args: [documentId],
  });
}
