import { getDb, ensureMigrated } from "./db";

export interface AuditLogEntry {
  id: number;
  adminId: string;
  adminUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

export async function logAuditEvent(event: {
  adminId: string;
  adminUsername: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: string;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO audit_log (admin_id, admin_username, action, target_type, target_id, details)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      event.adminId,
      event.adminUsername,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      event.details ?? null,
    ],
  });
}

export async function getRecentAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    adminId: String(row.admin_id),
    adminUsername: String(row.admin_username),
    action: String(row.action),
    targetType: row.target_type != null ? String(row.target_type) : null,
    targetId: row.target_id != null ? String(row.target_id) : null,
    details: row.details != null ? String(row.details) : null,
    createdAt: String(row.created_at),
  }));
}
