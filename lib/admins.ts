import { getDb } from "./db";
import type { Row } from "@libsql/client";

export interface AdminRecord {
  id: string;
  username: string;
  passwordHash: string | null;
  isSuper: boolean;
}

function rowToAdmin(row: Row): AdminRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: row.password_hash != null ? String(row.password_hash) : null,
    isSuper: Number(row.is_super) === 1,
  };
}

export async function readAdmins(): Promise<AdminRecord[]> {
  const db = getDb();
  const result = await db.execute("SELECT * FROM admins ORDER BY username");
  return result.rows.map(rowToAdmin);
}

export async function findAdmin(id: string): Promise<AdminRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM admins WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToAdmin(result.rows[0]) : null;
}

export async function findAdminByUsername(username: string): Promise<AdminRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM admins WHERE username = ?",
    args: [username],
  });
  return result.rows[0] ? rowToAdmin(result.rows[0]) : null;
}

export async function insertAdmin(
  admin: Omit<AdminRecord, "isSuper"> & { isSuper?: boolean }
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO admins (id, username, password_hash, is_super) VALUES (?, ?, ?, ?)",
    args: [admin.id, admin.username, admin.passwordHash, admin.isSuper ? 1 : 0],
  });
}

export async function updateAdmin(
  id: string,
  changes: { passwordHash?: string | null }
): Promise<void> {
  const db = getDb();
  const fields: string[] = [];
  const args: (string | null)[] = [];
  if (changes.passwordHash !== undefined) {
    fields.push("password_hash = ?");
    args.push(changes.passwordHash);
  }
  if (fields.length === 0) return;
  args.push(id);
  await db.execute({
    sql: `UPDATE admins SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

/** Super admin (is_super = 1) cannot be deleted. */
export async function deleteAdmin(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM admins WHERE id = ? AND is_super = 0",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
