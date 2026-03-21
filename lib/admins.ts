import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import { type AdminPermissions, allPermissionsTrue } from "./permissions";

export interface AdminRecord {
  id: string;
  username: string;
  passwordHash: string | null;
  isSuper: boolean;
  displayName: string | null;
  email: string | null;
  avatarPath: string | null;
  role: string;
  permissions: AdminPermissions;
}

function rowToAdmin(row: Row): AdminRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: row.password_hash != null ? String(row.password_hash) : null,
    isSuper: Number(row.is_super) === 1,
    displayName: row.display_name != null ? String(row.display_name) : null,
    email: row.email != null ? String(row.email) : null,
    avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
    role: row.role != null ? String(row.role) : "admin",
    permissions: {
      dashboard: Number(row.perm_dashboard) === 1,
      analyst: Number(row.perm_analyst) === 1,
      studio: Number(row.perm_studio) === 1,
      adcopy: Number(row.perm_adcopy) === 1,
      users: Number(row.perm_users) === 1,
      closers: Number(row.perm_closers) === 1,
      admin: Number(row.perm_admin) === 1,
    },
  };
}

export function getEffectivePermissions(admin: AdminRecord): AdminPermissions {
  if (admin.isSuper) return allPermissionsTrue();
  return admin.permissions;
}

export async function readAdmins(): Promise<AdminRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM admins ORDER BY username");
  return result.rows.map(rowToAdmin);
}

export async function findAdmin(id: string): Promise<AdminRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM admins WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToAdmin(result.rows[0]) : null;
}

export async function findAdminByUsername(username: string): Promise<AdminRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM admins WHERE username = ?",
    args: [username],
  });
  return result.rows[0] ? rowToAdmin(result.rows[0]) : null;
}

export async function insertAdmin(
  admin: Omit<AdminRecord, "isSuper" | "permissions" | "role"> & {
    isSuper?: boolean;
    role?: string;
    permissions?: Partial<AdminPermissions>;
  }
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const perms = admin.permissions ?? {};
  await db.execute({
    sql: `INSERT INTO admins (
      id, username, password_hash, is_super,
      display_name, email, avatar_path, role,
      perm_dashboard, perm_analyst, perm_studio,
      perm_adcopy, perm_users, perm_closers, perm_admin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      admin.id,
      admin.username,
      admin.passwordHash,
      admin.isSuper ? 1 : 0,
      admin.displayName,
      admin.email,
      admin.avatarPath,
      admin.role ?? "admin",
      perms.dashboard ? 1 : 0,
      perms.analyst ? 1 : 0,
      perms.studio ? 1 : 0,
      perms.adcopy ? 1 : 0,
      perms.users ? 1 : 0,
      perms.closers ? 1 : 0,
      perms.admin ? 1 : 0,
    ],
  });
}

export async function updateAdmin(
  id: string,
  changes: {
    passwordHash?: string | null;
    displayName?: string | null;
    email?: string | null;
    avatarPath?: string | null;
    role?: string;
    permissions?: Partial<AdminPermissions>;
  }
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.passwordHash !== undefined) {
    fields.push("password_hash = ?");
    args.push(changes.passwordHash);
  }
  if (changes.displayName !== undefined) {
    fields.push("display_name = ?");
    args.push(changes.displayName);
  }
  if (changes.email !== undefined) {
    fields.push("email = ?");
    args.push(changes.email);
  }
  if (changes.avatarPath !== undefined) {
    fields.push("avatar_path = ?");
    args.push(changes.avatarPath);
  }
  if (changes.role !== undefined) {
    fields.push("role = ?");
    args.push(changes.role);
  }
  if (changes.permissions) {
    const p = changes.permissions;
    if (p.dashboard !== undefined) { fields.push("perm_dashboard = ?"); args.push(p.dashboard ? 1 : 0); }
    if (p.analyst !== undefined) { fields.push("perm_analyst = ?"); args.push(p.analyst ? 1 : 0); }
    if (p.studio !== undefined) { fields.push("perm_studio = ?"); args.push(p.studio ? 1 : 0); }
    if (p.adcopy !== undefined) { fields.push("perm_adcopy = ?"); args.push(p.adcopy ? 1 : 0); }
    if (p.users !== undefined) { fields.push("perm_users = ?"); args.push(p.users ? 1 : 0); }
    if (p.closers !== undefined) { fields.push("perm_closers = ?"); args.push(p.closers ? 1 : 0); }
    if (p.admin !== undefined) { fields.push("perm_admin = ?"); args.push(p.admin ? 1 : 0); }
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
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM admins WHERE id = ? AND is_super = 0",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
