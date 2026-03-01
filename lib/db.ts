import { createClient, type Client } from "@libsql/client";

// Singleton client — one connection per Node.js process
let _client: Client | null = null;

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

export async function migrate(): Promise<void> {
  const db = getDb();

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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      is_super      INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Seed the super admin on first run (no-op if already exists)
  await db.execute(`
    INSERT OR IGNORE INTO admins (id, username, password_hash, is_super)
    VALUES ('agencycollective', 'agencycollective', NULL, 1)
  `);
}
