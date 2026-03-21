import { createClient, type Client } from "@libsql/client";

// Singleton client — one connection per Node.js process
let _client: Client | null = null;
let _migrated = false;
let _migratePromise: Promise<void> | null = null;

export function getDb(): Client {
  if (_client) return _client;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Add it to .env.local:\n" +
        "  TURSO_DATABASE_URL=libsql://your-db.turso.io\n" +
        "  TURSO_AUTH_TOKEN=your-token"
    );
  }

  _client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return _client;
}

/**
 * Ensure migration has run before executing queries.
 * Safe to call from any server-side code — deduplicates concurrent calls.
 */
export async function ensureMigrated(): Promise<void> {
  if (_migrated) return;
  if (!_migratePromise) {
    _migratePromise = migrate().then(() => { _migrated = true; });
  }
  await _migratePromise;
}

// ── Migration ──────────────────────────────────────────────────────────

/**
 * Check if the admins table has the expanded schema (profile + permission columns).
 * Uses UNQUOTED column names — SQLite treats double-quoted unknown identifiers
 * as string literals (not errors), so we must use unquoted names to get a real
 * "no such column" error when a column is missing.
 */
async function adminsHasNewColumns(db: Client): Promise<boolean> {
  try {
    await db.execute(
      `SELECT display_name, email, avatar_path, role,
              perm_dashboard, perm_analyst, perm_studio,
              perm_adcopy, perm_users, perm_closers, perm_admin
       FROM admins LIMIT 0`
    );
    return true;
  } catch {
    return false;
  }
}

export async function migrate(): Promise<void> {
  const db = getDb();
  console.log("[migrate] Starting database migration...");

  // ── Users table ────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      slug         TEXT NOT NULL UNIQUE,
      account_id   TEXT NOT NULL,
      display_name TEXT NOT NULL,
      logo_path    TEXT,
      password_hash TEXT
    )
  `);

  // ── Admins table (full schema for new databases) ───────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id             TEXT PRIMARY KEY,
      username       TEXT NOT NULL UNIQUE,
      password_hash  TEXT,
      is_super       INTEGER NOT NULL DEFAULT 0,
      display_name   TEXT,
      email          TEXT,
      avatar_path    TEXT,
      role           TEXT NOT NULL DEFAULT 'admin',
      perm_dashboard INTEGER NOT NULL DEFAULT 0,
      perm_analyst   INTEGER NOT NULL DEFAULT 0,
      perm_studio    INTEGER NOT NULL DEFAULT 0,
      perm_adcopy    INTEGER NOT NULL DEFAULT 0,
      perm_users     INTEGER NOT NULL DEFAULT 0,
      perm_closers   INTEGER NOT NULL DEFAULT 0,
      perm_admin     INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Seed the super admin on first run (no-op if already exists)
  await db.execute(`
    INSERT OR IGNORE INTO admins (id, username, password_hash, is_super)
    VALUES ('agencycollective', 'agencycollective', NULL, 1)
  `);

  // ── Migrate existing databases with old 4-column schema ────────────
  // If the table was created before the schema expansion, it only has
  // (id, username, password_hash, is_super). We detect this and rebuild.
  const hasNewCols = await adminsHasNewColumns(db);

  if (!hasNewCols) {
    console.log("[migrate] Old admins schema detected — rebuilding table with full schema...");

    // Figure out which columns exist in the old table for data copy
    const oldBaseCols = ["id", "username", "password_hash", "is_super"];
    const copyable: string[] = [];
    for (const col of oldBaseCols) {
      try {
        await db.execute(`SELECT ${col} FROM admins LIMIT 0`);
        copyable.push(col);
      } catch {
        // Column doesn't exist — skip
      }
    }

    // Create new table with full schema
    await db.execute(`DROP TABLE IF EXISTS admins_new`);
    await db.execute(`
      CREATE TABLE admins_new (
        id             TEXT PRIMARY KEY,
        username       TEXT NOT NULL UNIQUE,
        password_hash  TEXT,
        is_super       INTEGER NOT NULL DEFAULT 0,
        display_name   TEXT,
        email          TEXT,
        avatar_path    TEXT,
        role           TEXT NOT NULL DEFAULT 'admin',
        perm_dashboard INTEGER NOT NULL DEFAULT 0,
        perm_analyst   INTEGER NOT NULL DEFAULT 0,
        perm_studio    INTEGER NOT NULL DEFAULT 0,
        perm_adcopy    INTEGER NOT NULL DEFAULT 0,
        perm_users     INTEGER NOT NULL DEFAULT 0,
        perm_closers   INTEGER NOT NULL DEFAULT 0,
        perm_admin     INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Copy existing data
    if (copyable.length > 0) {
      const colList = copyable.join(", ");
      await db.execute(
        `INSERT OR IGNORE INTO admins_new (${colList}) SELECT ${colList} FROM admins`
      );
      console.log(`[migrate] Copied data from old table (columns: ${colList})`);
    }

    // Swap tables
    await db.execute(`DROP TABLE admins`);
    await db.execute(`ALTER TABLE admins_new RENAME TO admins`);
    console.log("[migrate] Admins table rebuilt successfully");
  }

  // ── Set permissions for seed super admin (idempotent) ──────────────
  await db.execute(`
    UPDATE admins
    SET display_name = 'Agency Collective',
        role = 'super_admin',
        perm_dashboard = 1, perm_analyst = 1, perm_studio = 1,
        perm_adcopy = 1, perm_users = 1, perm_closers = 1, perm_admin = 1
    WHERE id = 'agencycollective' AND display_name IS NULL
  `);

  // ── Audit log table ────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`
    );
  } catch {
    // Index may already exist
  }

  console.log("[migrate] Database migration complete");
}
