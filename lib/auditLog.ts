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

function rowToEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: Number(row.id),
    adminId: String(row.admin_id),
    adminUsername: String(row.admin_username),
    action: String(row.action),
    targetType: row.target_type != null ? String(row.target_type) : null,
    targetId: row.target_id != null ? String(row.target_id) : null,
    details: row.details != null ? String(row.details) : null,
    createdAt: String(row.created_at),
  };
}

/**
 * Read recent audit entries whose target_type starts with `prefix`
 * (e.g. "media_" for the Media Buyers activity feed). Parameterized LIKE.
 */
export async function getAuditLogsByTargetPrefix(
  prefix: string,
  limit = 50
): Promise<AuditLogEntry[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM audit_log WHERE target_type LIKE ? ORDER BY created_at DESC LIMIT ?",
    args: [`${prefix}%`, limit],
  });
  return result.rows.map((row) => rowToEntry(row as Record<string, unknown>));
}

/**
 * Delete audit entries whose target_type starts with `prefix`. When
 * `olderThanDays` is null, removes all of them; otherwise only those older than
 * the cutoff. Returns the number of rows removed. Parameterized.
 */
export async function clearAuditLogsByTargetPrefix(
  prefix: string,
  olderThanDays: number | null
): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  if (olderThanDays == null) {
    const r = await db.execute({
      sql: "DELETE FROM audit_log WHERE target_type LIKE ?",
      args: [`${prefix}%`],
    });
    return r.rowsAffected ?? 0;
  }
  // audit_log.created_at is datetime('now') (zone-less UTC "YYYY-MM-DD HH:MM:SS"),
  // which sorts/compares lexicographically against datetime('now', '-N days').
  const modifier = `-${Math.max(0, Math.floor(olderThanDays))} days`;
  const r = await db.execute({
    sql: "DELETE FROM audit_log WHERE target_type LIKE ? AND created_at < datetime('now', ?)",
    args: [`${prefix}%`, modifier],
  });
  return r.rowsAffected ?? 0;
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
