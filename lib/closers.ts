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
  /** Built-in system row (the House closer) — never a person: no login, not
   *  listed, not editable or deletable. Absent on records built in code. */
  isSystem?: boolean;
}

// ---------------------------------------------------------------------------
// House closer — the built-in credit target for deals an admin creates from
// the Deal queue without crediting a real closer (deals.closer_id is NOT
// NULL). A system row: hidden from every closer list (readClosers), unable to
// log in (findCloserByEmail skips it — and it has no password), and refused
// by edit/delete paths (deleting it would cascade its deals).
// ---------------------------------------------------------------------------

export const HOUSE_CLOSER_ID = "system-house";
export const HOUSE_CLOSER_NAME = "House";
// slugify() strips underscores, so no generated closer slug can collide.
const HOUSE_CLOSER_SLUG = "__system_house__";
// RFC 2606 reserved TLD — never deliverable, never a real login.
const HOUSE_CLOSER_EMAIL = "house@closers.invalid";

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
    isSystem: Number(row.is_system ?? 0) === 1,
  };
}

/**
 * Every closer/setter PERSON. System rows (the House closer) are excluded by
 * default — pass `includeSystem` only for id→name maps over deals, where a
 * House deal must still resolve to "House".
 */
export async function readClosers(
  options: { includeSystem?: boolean } = {}
): Promise<CloserRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    options.includeSystem
      ? "SELECT * FROM closers ORDER BY display_name"
      : "SELECT * FROM closers WHERE is_system = 0 ORDER BY display_name"
  );
  return result.rows.map(rowToCloser);
}

/**
 * The House closer, created on first use (idempotent — fixed id, INSERT OR
 * IGNORE). Active so the normal "credit an active closer" guards accept it;
 * zero commission/quota; no password.
 */
export async function ensureHouseCloser(): Promise<CloserRecord> {
  const existing = await findCloser(HOUSE_CLOSER_ID);
  if (existing) return existing;
  const db = getDb();
  await db.execute({
    sql: `INSERT OR IGNORE INTO closers
            (id, slug, display_name, email, password_hash, role, commission_rate, quota, status, avatar_path, is_system)
          VALUES (?, ?, ?, ?, NULL, 'closer', 0, 0, 'active', NULL, 1)`,
    args: [HOUSE_CLOSER_ID, HOUSE_CLOSER_SLUG, HOUSE_CLOSER_NAME, HOUSE_CLOSER_EMAIL],
  });
  const house = await findCloser(HOUSE_CLOSER_ID);
  if (!house) throw new Error("House closer could not be created");
  return house;
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
  // System rows are never a login: they have no password, and the
  // first-time "set password" flow would otherwise let anyone claim one.
  const result = await db.execute({
    sql: "SELECT * FROM closers WHERE email = ? COLLATE NOCASE AND is_system = 0",
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
  // The House closer owns admin-created deals (closer_id ON DELETE CASCADE) —
  // never delete it, and never run the cleanup below against it.
  const target = await db.execute({ sql: "SELECT is_system FROM closers WHERE id = ?", args: [id] });
  if (Number(target.rows[0]?.is_system ?? 0) === 1) return false;
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
  // Pending deal drafts credited to them can no longer be approved (approval
  // re-validates the closer). Reviewed drafts stay as history.
  await db
    .execute({ sql: "DELETE FROM deal_drafts WHERE closer_id = ? AND status = 'pending'", args: [id] })
    .catch((err) => console.error("[deleteCloser] deal_drafts cleanup failed (non-fatal):", err));
  // Pending drafts naming them as SETTER stay approvable: drop the setter
  // (approval then attributes the calendar claimer, if any).
  try {
    const pending = await db.execute({
      sql: "SELECT id, fields FROM deal_drafts WHERE status = 'pending' AND fields LIKE ?",
      args: [`%${id}%`],
    });
    for (const r of pending.rows) {
      const fields = JSON.parse(String(r.fields));
      if (fields?.setterId !== id) continue;
      await db.execute({
        sql: "UPDATE deal_drafts SET fields = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
        args: [JSON.stringify({ ...fields, setterId: null, setterTier: null }), new Date().toISOString(), String(r.id)],
      });
    }
  } catch (err) {
    console.error("[deleteCloser] deal_drafts setter cleanup failed (non-fatal):", err);
  }
  const result = await db.execute({
    sql: "DELETE FROM closers WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
