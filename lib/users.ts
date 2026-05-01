import { getDb } from "./db";
import type { Client, Row } from "@libsql/client";

export type UserStatus = "active" | "onboarding" | "inactive" | "archived";

export interface UserRecord {
  id: string;
  slug: string;
  accountId: string;          // legacy single-account field
  displayName: string;
  logoPath: string | null;
  passwordHash: string | null;
  email: string | null;
  status: UserStatus;
  mrr: number;                // in cents
  category: string | null;
  createdAt: string;
  analystEnabled: boolean;    // gates client-portal AI analyst access
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

/**
 * One-shot probe for the `analyst_enabled` column. Cached on success so we
 * don't pay a roundtrip per insert/update. Cached `false` is re-probed in
 * case migration runs after the first call.
 */
let _hasAnalystEnabledCol: boolean = false;
async function hasAnalystEnabledColumn(db: Client): Promise<boolean> {
  if (_hasAnalystEnabledCol) return true;
  try {
    await db.execute("SELECT analyst_enabled FROM users LIMIT 0");
    _hasAnalystEnabledCol = true;
    return true;
  } catch {
    return false;
  }
}

function rowToUser(row: Row): UserRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    logoPath: row.logo_path != null ? String(row.logo_path) : null,
    passwordHash: row.password_hash != null ? String(row.password_hash) : null,
    email: row.email != null ? String(row.email) : null,
    status: (String(row.status || "active") as UserStatus),
    mrr: Number(row.mrr ?? 0),
    category: row.category != null ? String(row.category) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    // Default true if column missing (pre-migration row read).
    analystEnabled: row.analyst_enabled == null ? true : Number(row.analyst_enabled) === 1,
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

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
    args: [email.trim().toLowerCase()],
  });
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function insertUser(user: UserRecord): Promise<void> {
  const db = getDb();
  const includeAnalyst = await hasAnalystEnabledColumn(db);

  if (includeAnalyst) {
    await db.execute({
      sql: `INSERT INTO users (id, slug, account_id, display_name, logo_path, password_hash, email, status, mrr, category, analyst_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user.id,
        user.slug,
        user.accountId,
        user.displayName,
        user.logoPath,
        user.passwordHash,
        user.email,
        user.status,
        user.mrr,
        user.category,
        user.analystEnabled ? 1 : 0,
      ],
    });
    return;
  }

  // Column not present yet (migration hasn't reached this DB) — write the
  // base columns; the new flag will be NULL → coerced to true on read until
  // the migration adds the column with its DEFAULT 1.
  await db.execute({
    sql: `INSERT INTO users (id, slug, account_id, display_name, logo_path, password_hash, email, status, mrr, category)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      user.slug,
      user.accountId,
      user.displayName,
      user.logoPath,
      user.passwordHash,
      user.email,
      user.status,
      user.mrr,
      user.category,
    ],
  });
}

export async function updateUser(
  id: string,
  changes: Partial<Omit<UserRecord, "id">>
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

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
  if (changes.email !== undefined) {
    fields.push("email = ?");
    args.push(changes.email);
  }
  if (changes.status !== undefined) {
    fields.push("status = ?");
    args.push(changes.status);
  }
  if (changes.mrr !== undefined) {
    fields.push("mrr = ?");
    args.push(changes.mrr);
  }
  if (changes.category !== undefined) {
    fields.push("category = ?");
    args.push(changes.category);
  }

  const db = getDb();

  // Only emit the analyst_enabled write when the column exists. On a DB
  // where the migration hasn't landed yet we silently skip — the rest of
  // the update still applies, and the toggle just doesn't persist until
  // migration runs (next request, since SCHEMA_VERSION is bumped).
  if (changes.analystEnabled !== undefined && (await hasAnalystEnabledColumn(db))) {
    fields.push("analyst_enabled = ?");
    args.push(changes.analystEnabled ? 1 : 0);
  }

  if (fields.length === 0) return;
  args.push(id);

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
