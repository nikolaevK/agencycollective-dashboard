import { getDb } from "./db";
import type { Row } from "@libsql/client";

export interface UserRecord {
  id: string;
  slug: string;
  accountId: string;
  displayName: string;
  logoPath: string | null;
  passwordHash: string | null;
}

// ---------------------------------------------------------------------------
// Slug utilities (synchronous)
// ---------------------------------------------------------------------------

/** Convert a display name to a URL-safe slug, e.g. "Inner Glow" → "inner-glow" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Return a slug that doesn't clash with existing users (appends -2, -3 … if needed) */
export function uniqueSlug(
  base: string,
  users: UserRecord[],
  excludeId?: string
): string {
  const taken = new Set(
    users.filter((u) => u.id !== excludeId).map((u) => u.slug)
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Async version: queries DB directly to find a unique slug.
 * Use this instead of uniqueSlug when you don't already have the user list.
 */
export async function generateUniqueSlug(
  base: string,
  excludeId?: string
): Promise<string> {
  const db = getDb();
  const result = await db.execute(
    excludeId
      ? { sql: "SELECT slug FROM users WHERE id != ?", args: [excludeId] }
      : "SELECT slug FROM users"
  );
  const taken = new Set(result.rows.map((r) => String(r.slug)));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ---------------------------------------------------------------------------
// Account ID helper (synchronous)
// ---------------------------------------------------------------------------

export function normalizeAccountId(raw: string): string {
  const stripped = String(raw).trim().replace(/^act_/, "");
  return `act_${stripped}`;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function rowToUser(row: Row): UserRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    logoPath: row.logo_path != null ? String(row.logo_path) : null,
    passwordHash: row.password_hash != null ? String(row.password_hash) : null,
  };
}

export async function readUsers(): Promise<UserRecord[]> {
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM users ORDER BY display_name"
  );
  return result.rows.map(rowToUser);
}

export async function findUser(id: string): Promise<UserRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function findUserBySlug(slug: string): Promise<UserRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE slug = ?",
    args: [slug],
  });
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function insertUser(user: UserRecord): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO users (id, slug, account_id, display_name, logo_path, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      user.id,
      user.slug,
      user.accountId,
      user.displayName,
      user.logoPath,
      user.passwordHash,
    ],
  });
}

export async function updateUser(
  id: string,
  changes: Partial<Omit<UserRecord, "id">>
): Promise<void> {
  const fields: string[] = [];
  const args: (string | null)[] = [];

  if (changes.slug !== undefined) {
    fields.push("slug = ?");
    args.push(changes.slug);
  }
  if (changes.accountId !== undefined) {
    fields.push("account_id = ?");
    args.push(changes.accountId);
  }
  if (changes.displayName !== undefined) {
    fields.push("display_name = ?");
    args.push(changes.displayName);
  }
  if (changes.logoPath !== undefined) {
    fields.push("logo_path = ?");
    args.push(changes.logoPath);
  }
  if (changes.passwordHash !== undefined) {
    fields.push("password_hash = ?");
    args.push(changes.passwordHash);
  }

  if (fields.length === 0) return;
  args.push(id);

  const db = getDb();
  await db.execute({
    sql: `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM users WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
