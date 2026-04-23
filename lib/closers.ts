import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import { slugify } from "./users";

export type CloserStatus = "active" | "inactive";

export type CloserRole =
  | "senior_closer"
  | "account_executive"
  | "inbound_specialist"
  | "closer"
  | "setter";

export interface CloserRecord {
  id: string;
  slug: string;
  displayName: string;
  email: string;
  passwordHash: string | null;
  role: CloserRole;
  commissionRate: number; // basis points (1250 = 12.5%)
  quota: number; // cents
  status: CloserStatus;
  avatarPath: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Slug utilities
// ---------------------------------------------------------------------------

export async function generateUniqueCloserSlug(
  base: string,
  excludeId?: string
): Promise<string> {
  const db = getDb();
  const result = await db.execute(
    excludeId
      ? { sql: "SELECT slug FROM closers WHERE id != ?", args: [excludeId] }
      : "SELECT slug FROM closers"
  );
  const taken = new Set(result.rows.map((r) => String(r.slug)));
  const slug = slugify(base);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function rowToCloser(row: Row): CloserRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.display_name),
    email: String(row.email),
    passwordHash: row.password_hash != null ? String(row.password_hash) : null,
    role: String(row.role || "closer") as CloserRole,
    commissionRate: Number(row.commission_rate ?? 0),
    quota: Number(row.quota ?? 0),
    status: String(row.status || "active") as CloserStatus,
    avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function readClosers(): Promise<CloserRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM closers ORDER BY display_name"
  );
  return result.rows.map(rowToCloser);
}

export async function findCloser(id: string): Promise<CloserRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM closers WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToCloser(result.rows[0]) : null;
}

export async function findCloserBySlug(
  slug: string
): Promise<CloserRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM closers WHERE slug = ?",
    args: [slug],
  });
  return result.rows[0] ? rowToCloser(result.rows[0]) : null;
}

export async function findCloserByEmail(
  email: string
): Promise<CloserRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM closers WHERE email = ? COLLATE NOCASE",
    args: [email.trim().toLowerCase()],
  });
  return result.rows[0] ? rowToCloser(result.rows[0]) : null;
}

export async function insertCloser(closer: CloserRecord): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO closers (id, slug, display_name, email, password_hash, role, commission_rate, quota, status, avatar_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      closer.id,
      closer.slug,
      closer.displayName,
      closer.email,
      closer.passwordHash,
      closer.role,
      closer.commissionRate,
      closer.quota,
      closer.status,
      closer.avatarPath,
    ],
  });
}

export async function updateCloser(
  id: string,
  changes: Partial<Omit<CloserRecord, "id">>
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.slug !== undefined) {
    fields.push("slug = ?");
    args.push(changes.slug);
  }
  if (changes.displayName !== undefined) {
    fields.push("display_name = ?");
    args.push(changes.displayName);
  }
  if (changes.email !== undefined) {
    fields.push("email = ?");
    args.push(changes.email);
  }
  if (changes.passwordHash !== undefined) {
    fields.push("password_hash = ?");
    args.push(changes.passwordHash);
  }
  if (changes.role !== undefined) {
    fields.push("role = ?");
    args.push(changes.role);
  }
  if (changes.commissionRate !== undefined) {
    fields.push("commission_rate = ?");
    args.push(changes.commissionRate);
  }
  if (changes.quota !== undefined) {
    fields.push("quota = ?");
    args.push(changes.quota);
  }
  if (changes.status !== undefined) {
    fields.push("status = ?");
    args.push(changes.status);
  }
  if (changes.avatarPath !== undefined) {
    fields.push("avatar_path = ?");
    args.push(changes.avatarPath);
  }

  if (fields.length === 0) return;
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `UPDATE closers SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function deleteCloser(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  // libSQL does not guarantee FK CASCADE fires, so clear setter-side links
  // explicitly before removing the closer row. Setter-owned appointments are
  // deleted outright (they're worthless without the setter). Deals keep their
  // data but get their setter_id nulled — losing attribution is better than
  // a dangling reference that silently misattributes a future setter.
  await db.execute({
    sql: "DELETE FROM appointments WHERE setter_id = ?",
    args: [id],
  });
  await db.execute({
    sql: "UPDATE deals SET setter_id = NULL, updated_at = datetime('now') WHERE setter_id = ?",
    args: [id],
  });
  // Notes are strictly private — delete with the owner to avoid orphans
  // that no one can access but still occupy rows. The cascade on note_shares
  // handles shares from THEIR notes; we still need to clean rows where they
  // were a RECIPIENT (no FK on shared_with_id, so no automatic cleanup).
  await db.execute({
    sql: "DELETE FROM notes WHERE owner_id = ?",
    args: [id],
  });
  await db.execute({
    sql: "DELETE FROM note_shares WHERE shared_with_id = ?",
    args: [id],
  });
  const result = await db.execute({
    sql: "DELETE FROM closers WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
