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
  designBoardEnabled: boolean;   // gates client-portal Design Board (Figma embed)
  designBoardUrl: string | null; // raw Figma share link shown on the Design Board
  joinedAt: string | null;    // client start date (seeded from payout date_joined)
  payoutBrand: string | null; // explicit link to a Payout-DB brand_name
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

/**
 * Probe for the Client Directory columns (joined_at, payout_brand). Same
 * cache-on-success pattern as the analyst flag — these are additive and a DB
 * that hasn't migrated yet simply skips the write until the column lands.
 */
let _hasClientDirCols: boolean = false;
async function hasClientDirectoryColumns(db: Client): Promise<boolean> {
  if (_hasClientDirCols) return true;
  try {
    await db.execute("SELECT joined_at, payout_brand FROM users LIMIT 0");
    _hasClientDirCols = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe for the Design Board columns (design_board_enabled, design_board_url).
 * Same cache-on-success pattern — a not-yet-migrated DB skips the write until
 * the columns land.
 */
let _hasDesignBoardCols: boolean = false;
async function hasDesignBoardColumns(db: Client): Promise<boolean> {
  if (_hasDesignBoardCols) return true;
  try {
    await db.execute("SELECT design_board_enabled, design_board_url FROM users LIMIT 0");
    _hasDesignBoardCols = true;
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
    designBoardEnabled: row.design_board_enabled == null ? true : Number(row.design_board_enabled) === 1,
    designBoardUrl: row.design_board_url != null ? String(row.design_board_url) : null,
    joinedAt: row.joined_at != null ? String(row.joined_at) : null,
    payoutBrand: row.payout_brand != null ? String(row.payout_brand) : null,
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

  // Base columns are always present. Optional additive columns are appended only
  // when the migration has landed on this DB; otherwise they fall back to their
  // schema DEFAULTs (analyst_enabled → 1, design_board_enabled → 1,
  // design_board_url → NULL) and are coerced on read. Building the column list
  // dynamically keeps every present-column combination correct without a branch
  // per column.
  const cols = [
    "id", "slug", "account_id", "display_name", "logo_path",
    "password_hash", "email", "status", "mrr", "category",
  ];
  const args: (string | number | null)[] = [
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
  ];

  if (await hasAnalystEnabledColumn(db)) {
    cols.push("analyst_enabled");
    args.push(user.analystEnabled ? 1 : 0);
  }
  if (await hasDesignBoardColumns(db)) {
    cols.push("design_board_enabled", "design_board_url");
    args.push(user.designBoardEnabled ? 1 : 0, user.designBoardUrl);
  }

  const placeholders = cols.map(() => "?").join(", ");
  await db.execute({
    sql: `INSERT INTO users (${cols.join(", ")}) VALUES (${placeholders})`,
    args,
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

  // Design Board columns — only emitted when the migration has landed.
  if (
    (changes.designBoardEnabled !== undefined || changes.designBoardUrl !== undefined) &&
    (await hasDesignBoardColumns(db))
  ) {
    if (changes.designBoardEnabled !== undefined) {
      fields.push("design_board_enabled = ?");
      args.push(changes.designBoardEnabled ? 1 : 0);
    }
    if (changes.designBoardUrl !== undefined) {
      fields.push("design_board_url = ?");
      args.push(changes.designBoardUrl);
    }
  }

  // Client Directory columns — only emitted when the migration has landed.
  if (
    (changes.joinedAt !== undefined || changes.payoutBrand !== undefined) &&
    (await hasClientDirectoryColumns(db))
  ) {
    if (changes.joinedAt !== undefined) {
      fields.push("joined_at = ?");
      args.push(changes.joinedAt);
    }
    if (changes.payoutBrand !== undefined) {
      fields.push("payout_brand = ?");
      args.push(changes.payoutBrand);
    }
  }

  if (fields.length === 0) return;
  args.push(id);

  await db.execute({
    sql: `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

// ---------------------------------------------------------------------------
// Brand logo — stored as a BLOB on the user row (filesystem is read-only at
// runtime on Vercel). Served publicly via /api/clients/[id]/logo.
// ---------------------------------------------------------------------------

function blobToBuffer(raw: unknown): Buffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  return null;
}

/** Store (or replace) a user's logo blob + content type, and its serve URL. */
export async function setUserLogo(
  id: string,
  data: Buffer,
  contentType: string,
  logoPath: string
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE users SET logo_data = ?, logo_type = ?, logo_path = ? WHERE id = ?",
    args: [data, contentType, logoPath, id],
  });
}

/** Remove a user's logo (blob, type, and path). */
export async function clearUserLogo(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE users SET logo_data = NULL, logo_type = NULL, logo_path = NULL WHERE id = ?",
    args: [id],
  });
}

/** The logo bytes + content type for the serve route; null when none. */
export async function getUserLogo(
  id: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const db = getDb();
  let result;
  try {
    result = await db.execute({
      sql: "SELECT logo_data, logo_type FROM users WHERE id = ?",
      args: [id],
    });
  } catch {
    // Columns not migrated yet on this DB.
    return null;
  }
  const row = result.rows[0];
  if (!row) return null;
  const data = blobToBuffer(row.logo_data);
  if (!data) return null;
  return { data, contentType: row.logo_type != null ? String(row.logo_type) : "image/png" };
}

export async function deleteUser(id: string): Promise<boolean> {
  const db = getDb();

  // Explicit cleanup of Client Directory child rows. libSQL FK cascade is not
  // guaranteed to fire (see CLAUDE.md), so we don't rely on it for these
  // additive tables. Best-effort + tolerant of a not-yet-migrated DB.
  for (const table of ["client_notes", "client_billing"]) {
    try {
      await db.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [id] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/no such table/i.test(msg)) {
        console.error(`[deleteUser] cleanup of ${table} failed (non-fatal):`, err);
      }
    }
  }

  // Ad accounts survive a client deletion — they're standalone billable
  // entities. Just unattach them (the FK is ON DELETE SET NULL, but libSQL
  // cascade isn't guaranteed to fire, so do it explicitly). Best-effort.
  try {
    await db.execute({
      sql: "UPDATE ad_accounts SET user_id = NULL, updated_at = datetime('now') WHERE user_id = ?",
      args: [id],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such table/i.test(msg)) {
      console.error("[deleteUser] unattach of ad_accounts failed (non-fatal):", err);
    }
  }

  const result = await db.execute({
    sql: "DELETE FROM users WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
