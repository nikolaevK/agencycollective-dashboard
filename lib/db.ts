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
    _migratePromise = migrate()
      .then(() => { _migrated = true; })
      .catch((err) => { _migratePromise = null; throw err; });
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
/**
 * Check if the users table has the expanded schema (email, status, mrr, etc.).
 */
async function usersHasNewColumns(db: Client): Promise<boolean> {
  try {
    await db.execute(`SELECT email, status, mrr, category, created_at FROM users LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

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
      perm_jsoneditor INTEGER NOT NULL DEFAULT 0,
      perm_adcopy    INTEGER NOT NULL DEFAULT 0,
      perm_invoice   INTEGER NOT NULL DEFAULT 0,
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
        perm_jsoneditor INTEGER NOT NULL DEFAULT 0,
        perm_adcopy    INTEGER NOT NULL DEFAULT 0,
        perm_invoice   INTEGER NOT NULL DEFAULT 0,
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

  // ── Add perm_jsoneditor column to existing admins tables ────────────
  try {
    await db.execute(`SELECT perm_jsoneditor FROM admins LIMIT 0`);
  } catch {
    await db.execute(`ALTER TABLE admins ADD COLUMN perm_jsoneditor INTEGER NOT NULL DEFAULT 0`);
    console.log("[migrate] Added perm_jsoneditor column to admins");
  }

  // ── Add perm_invoice column to existing admins tables ──────────────
  try {
    await db.execute(`SELECT perm_invoice FROM admins LIMIT 0`);
  } catch {
    await db.execute(`ALTER TABLE admins ADD COLUMN perm_invoice INTEGER NOT NULL DEFAULT 0`);
    console.log("[migrate] Added perm_invoice column to admins");
  }

  // ── Set permissions for seed super admin (idempotent) ──────────────
  await db.execute(`
    UPDATE admins
    SET display_name = 'Agency Collective',
        role = 'super_admin',
        perm_dashboard = 1, perm_analyst = 1, perm_studio = 1, perm_jsoneditor = 1,
        perm_adcopy = 1, perm_invoice = 1, perm_users = 1, perm_closers = 1, perm_admin = 1
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

  // ── Client accounts junction table ──────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS client_accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id  TEXT NOT NULL,
      label       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, account_id)
    )
  `);

  // ── Expand users table with new columns ─────────────────────────────
  const usersExpanded = await usersHasNewColumns(db);

  if (!usersExpanded) {
    console.log("[migrate] Expanding users table with new columns...");

    const alterCols = [
      "ALTER TABLE users ADD COLUMN email TEXT",
      "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
      "ALTER TABLE users ADD COLUMN mrr INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN category TEXT",
      "ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ];

    for (const sql of alterCols) {
      try {
        await db.execute(sql);
      } catch {
        // Column may already exist
      }
    }

    console.log("[migrate] Users table columns added");
  }

  // ── Migrate existing single account_id to client_accounts ───────────
  // For users that have an account_id set but no rows in client_accounts,
  // create a row so the junction table becomes the source of truth.
  await db.execute(`
    INSERT OR IGNORE INTO client_accounts (user_id, account_id, is_active)
    SELECT id, account_id, 1 FROM users
    WHERE account_id != ''
      AND id NOT IN (SELECT user_id FROM client_accounts)
  `);

  // ── Closers table ──────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS closers (
      id              TEXT PRIMARY KEY,
      slug            TEXT NOT NULL UNIQUE,
      display_name    TEXT NOT NULL,
      email           TEXT NOT NULL,
      password_hash   TEXT,
      role            TEXT NOT NULL DEFAULT 'closer',
      commission_rate INTEGER NOT NULL DEFAULT 0,
      quota           INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'active',
      avatar_path     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Deals table ───────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS deals (
      id              TEXT PRIMARY KEY,
      closer_id       TEXT NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
      client_name     TEXT NOT NULL,
      client_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
      deal_value      INTEGER NOT NULL DEFAULT 0,
      service_category TEXT,
      closing_date    TEXT,
      status          TEXT NOT NULL DEFAULT 'in_progress',
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_deals_closer_id ON deals(closer_id)`
    );
  } catch {
    // Index may already exist
  }

  // ── Add google_event_id to deals (if not present) ────────────────
  try {
    await db.execute(`SELECT google_event_id FROM deals LIMIT 0`);
  } catch {
    try {
      await db.execute(`ALTER TABLE deals ADD COLUMN google_event_id TEXT`);
      console.log("[migrate] Added google_event_id column to deals");
    } catch (err) {
      console.warn("[migrate] Could not add google_event_id column:", err);
    }
  }

  // ── Add show_status to deals (if not present) ───────────────────
  try {
    await db.execute(`SELECT show_status FROM deals LIMIT 0`);
  } catch {
    try {
      await db.execute(`ALTER TABLE deals ADD COLUMN show_status TEXT`);
      console.log("[migrate] Added show_status column to deals");
    } catch (err) {
      console.warn("[migrate] Could not add show_status column:", err);
    }
  }

  // ── Add industry to deals (if not present) ──────────────────────
  try {
    await db.execute(`SELECT industry FROM deals LIMIT 0`);
  } catch {
    try {
      await db.execute(`ALTER TABLE deals ADD COLUMN industry TEXT`);
      console.log("[migrate] Added industry column to deals");
    } catch (err) {
      console.warn("[migrate] Could not add industry column:", err);
    }
  }

  // ── Migrate old statuses to new ones ────────────────────────────
  try {
    await db.execute(`UPDATE deals SET status = 'follow_up' WHERE status = 'in_progress'`);
    await db.execute(`UPDATE deals SET status = 'rescheduled' WHERE status = 'pending'`);
  } catch {
    // Ignore if already migrated
  }

  // ── Event attendance table (show/no-show per calendar event) ──────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_attendance (
      google_event_id TEXT NOT NULL,
      closer_id       TEXT NOT NULL,
      show_status     TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (google_event_id, closer_id)
    )
  `);

  // ── Backfill attendance from closed deals with calendar links ─────
  try {
    await db.execute(`
      INSERT OR IGNORE INTO event_attendance (google_event_id, closer_id, show_status)
      SELECT google_event_id, closer_id, 'showed'
      FROM deals
      WHERE google_event_id IS NOT NULL AND status = 'closed'
    `);
  } catch {
    // Ignore if backfill fails
  }

  // ── Google Calendar config table ──────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS google_calendar_config (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      label         TEXT NOT NULL DEFAULT 'Main Calendar',
      email         TEXT,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      calendar_id   TEXT NOT NULL DEFAULT 'primary',
      connected_by  TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Payouts table (payout tracker) ───────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS payouts (
      id                TEXT PRIMARY KEY,
      payout_month      INTEGER NOT NULL,
      payout_year       INTEGER NOT NULL,
      date_joined       TEXT,
      first_day_ad_spend TEXT,
      brand_name        TEXT NOT NULL,
      vertical          TEXT,
      point_of_contact  TEXT,
      service           TEXT,
      is_signed         INTEGER NOT NULL DEFAULT 0,
      is_paid           INTEGER NOT NULL DEFAULT 0,
      added_to_slack    INTEGER NOT NULL DEFAULT 0,
      amount_due        INTEGER NOT NULL DEFAULT 0,
      amount_paid       INTEGER NOT NULL DEFAULT 0,
      payment_notes     TEXT,
      sales_rep         TEXT,
      pay_distributed   TEXT NOT NULL DEFAULT 'No',
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_payouts_month_year
    ON payouts(payout_year, payout_month)
  `);

  // ── Add new payout columns (if not present) ────────────────────────
  const payoutNewCols = [
    { col: "pay_distributed_date", sql: "ALTER TABLE payouts ADD COLUMN pay_distributed_date TEXT" },
    { col: "commission_split", sql: "ALTER TABLE payouts ADD COLUMN commission_split INTEGER NOT NULL DEFAULT 0" },
    { col: "split_details", sql: "ALTER TABLE payouts ADD COLUMN split_details TEXT" },
    { col: "referral", sql: "ALTER TABLE payouts ADD COLUMN referral TEXT" },
    { col: "referral_pct", sql: "ALTER TABLE payouts ADD COLUMN referral_pct INTEGER" },
  ];

  for (const { col, sql } of payoutNewCols) {
    try {
      await db.execute(`SELECT ${col} FROM payouts LIMIT 0`);
    } catch {
      try {
        await db.execute(sql);
        console.log(`[migrate] Added ${col} column to payouts`);
      } catch (err) {
        console.warn(`[migrate] Could not add ${col} column:`, err);
      }
    }
  }

  // ── Sales rep options table ─────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sales_rep_options (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Seed from existing payout data (idempotent)
  await db.execute(`
    INSERT OR IGNORE INTO sales_rep_options (name)
    SELECT DISTINCT sales_rep FROM payouts
    WHERE sales_rep IS NOT NULL AND sales_rep != ''
  `);

  // ── Vertical options table ──────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vertical_options (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Seed from existing payout data (idempotent)
  await db.execute(`
    INSERT OR IGNORE INTO vertical_options (name)
    SELECT DISTINCT vertical FROM payouts
    WHERE vertical IS NOT NULL AND vertical != ''
  `);

  // ── Referral options table ────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS referral_options (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Seed from existing payout data (idempotent)
  await db.execute(`
    INSERT OR IGNORE INTO referral_options (name)
    SELECT DISTINCT referral FROM payouts
    WHERE referral IS NOT NULL AND referral != ''
  `);

  // ── Onboarding progress (per-user step tracking) ─────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      step_id      TEXT NOT NULL,
      completed    INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, step_id)
    )
  `);

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_progress(user_id)`);
  } catch (err) {
    console.warn("[migrate] Could not create idx_onboarding_user:", err);
  }

  // ── Payout documents table ───────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS payout_documents (
      id                TEXT PRIMARY KEY,
      normalized_brand  TEXT NOT NULL,
      brand_name        TEXT NOT NULL,
      doc_type          TEXT NOT NULL CHECK (doc_type IN ('project_scope', 'invoice')),
      file_name         TEXT NOT NULL,
      file_path         TEXT NOT NULL,
      file_size         INTEGER NOT NULL DEFAULT 0,
      payout_month      INTEGER,
      payout_year       INTEGER,
      uploaded_by       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_payout_docs_brand ON payout_documents(normalized_brand)`);
  } catch (err) {
    console.warn("[migrate] Could not create idx_payout_docs_brand:", err);
  }

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_payout_docs_type ON payout_documents(doc_type)`);
  } catch (err) {
    console.warn("[migrate] Could not create idx_payout_docs_type:", err);
  }

  // ── Add file_data BLOB column (replaces filesystem storage) ─────
  try {
    await db.execute(`ALTER TABLE payout_documents ADD COLUMN file_data BLOB`);
  } catch {
    // column already exists
  }

  // ── Add client_email to deals (if not present) ──────────────────
  try {
    await db.execute(`SELECT client_email FROM deals LIMIT 0`);
  } catch {
    try {
      await db.execute(`ALTER TABLE deals ADD COLUMN client_email TEXT`);
      console.log("[migrate] Added client_email column to deals");
    } catch (err) {
      console.warn("[migrate] Could not add client_email column:", err);
    }
  }

  // ── Invoice services table (admin-managed presets) ──────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS invoice_services (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      rate            INTEGER NOT NULL DEFAULT 0,
      deal_service_key TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Seed default invoice services if empty ───────────────────────
  {
    const cnt = await db.execute("SELECT COUNT(*) as cnt FROM invoice_services");
    if (Number(cnt.rows[0]?.cnt ?? 0) === 0) {
      const seeds: [string, string, number, string | null][] = [
        ["Ad Creatives Creation Retainer", "Creative Strategy & Concepts\nAd Copy & Messaging\nVisual Assets & Templates\nReady to use Ad Creatives", 200000, "Creative Design"],
        ["Ad Management Retainer", "Full-funnel ad strategy & creative direction.\nCampaign setup, audience building, and optimization.\nReporting dashboards and insights.", 500000, "Meta Ads"],
        ["All-In-One Peptide Marketing for Startups", "Meta Ads + Creative Production + Email Marketing (No SMS)", 550000, null],
        ["All-In-One Telemed Marketing Package", "Meta Ads + Creative Production + Email Marketing (No SMS)", 550000, null],
        ["Email Marketing", "Complete email strategy & setup\n3 core flows\n1-2 campaigns per month\nList segmentation & reporting", 150000, "Email Marketing"],
        ["Email Retainer", "Email & SMS Flows\nAbandonment Cart Recovery\nEmail & SMS Campaigns\nAutomated Flow Optimization", 200000, null],
        ["Premium Package", "Meta Ads + Unlimited Creatives + Email & SMS Marketing\nDedicated support & consultation", 1200000, null],
        ["Web Development - Research Peptides", "Website Setup & Customization\nPayment & Compliance Integration", 300000, "Web Design"],
      ];
      for (let i = 0; i < seeds.length; i++) {
        const [name, desc, rate, key] = seeds[i];
        await db.execute({
          sql: `INSERT INTO invoice_services (id, name, description, rate, deal_service_key, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [crypto.randomUUID(), name, desc, rate, key, i],
        });
      }
      console.log("[migrate] Seeded default invoice services");
    }
  }

  // ── Deal invoices table ─────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS deal_invoices (
      id              TEXT PRIMARY KEY,
      deal_id         TEXT NOT NULL UNIQUE,
      invoice_number  TEXT NOT NULL UNIQUE,
      invoice_data    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'draft',
      client_email    TEXT,
      sent_at         TEXT,
      sent_count      INTEGER NOT NULL DEFAULT 0,
      created_by      TEXT,
      sent_by         TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_deal_invoices_deal_id ON deal_invoices(deal_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_deal_invoices_status ON deal_invoices(status)`);
  } catch {
    // indexes may already exist
  }

  // ── Add pdf_data BLOB column to deal_invoices ───────────────────
  try {
    await db.execute(`SELECT pdf_data FROM deal_invoices LIMIT 0`);
  } catch {
    try {
      await db.execute(`ALTER TABLE deal_invoices ADD COLUMN pdf_data BLOB`);
      console.log("[migrate] Added pdf_data column to deal_invoices");
    } catch {
      // already exists
    }
  }

  // ── Add payment_type to deals (if not present) ──────────────────
  try {
    await db.execute(`SELECT payment_type FROM deals LIMIT 0`);
  } catch {
    try {
      await db.execute(`ALTER TABLE deals ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'local'`);
      console.log("[migrate] Added payment_type column to deals");
    } catch {
      // already exists
    }
  }

  // ── Agency config table ─────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agency_config (
      id              TEXT PRIMARY KEY,
      config_key      TEXT NOT NULL UNIQUE,
      config_value    TEXT NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Seed agency config if empty
  {
    const cnt = await db.execute("SELECT COUNT(*) as cnt FROM agency_config");
    if (Number(cnt.rows[0]?.cnt ?? 0) === 0) {
      const sender = JSON.stringify({
        name: "Agency Collective LLC",
        address: "30 N Gould St",
        city: "Sheridan",
        zipCode: "82801",
        country: "WY, USA",
        email: "sales@agencycollective.ai",
        phone: "+1 (310) 559-1655",
      });
      const noteLocal = "Payment through Wire or Zelle\n\nZelle info:\nPhone number: 3109805141\n\nWire info:\nAccount number: 4215126533380992\nRouting number: 121145433\nBank Name: Column N.A.\nBank Address:\n1 Letterman Drive, Building A,\nSuite A4-700\nSan Francisco, CA 94129\nUSA\n\nBeneficiary Name: AGENCY COLLECTIVE LLC\nBeneficiary Address: 30 North Gould Street, #25048\nSheridan, WY 82801\nUSA\n\nDigital Service/Work - Non Refundable";
      const noteInternational = "Payment through Wire\n\nWire info:\nSWIFT / BIC Code: CLNOUS66MER\nAccount number: 421512653380992\nRouting number: 121145433\nIf the sending bank doesn't recognize this ABA Routing Number,\nplease use: 121145307\n\nBank Name: Column N.A.\nBank Address:\n1 Letterman Drive, Building A,\nSuite A4-700\nSan Francisco, CA 94129\nUSA\n\nBeneficiary Name: AGENCY COLLECTIVE LLC\nBeneficiary Address: 30 North Gould Street, #25046\nSheridan, WY 82801\nUSA\n\nDigital Service/Work - Non Refundable";

      await db.execute({ sql: `INSERT INTO agency_config (id, config_key, config_value) VALUES (?, ?, ?)`, args: [crypto.randomUUID(), "sender", sender] });
      await db.execute({ sql: `INSERT INTO agency_config (id, config_key, config_value) VALUES (?, ?, ?)`, args: [crypto.randomUUID(), "note_local", noteLocal] });
      await db.execute({ sql: `INSERT INTO agency_config (id, config_key, config_value) VALUES (?, ?, ?)`, args: [crypto.randomUUID(), "note_international", noteInternational] });
      console.log("[migrate] Seeded agency config");
    }
  }

  // Seed default_logo and default_theme_color if not present
  {
    const logoCheck = await db.execute({ sql: "SELECT id FROM agency_config WHERE config_key = ?", args: ["default_logo"] });
    if (logoCheck.rows.length === 0) {
      await db.execute({ sql: `INSERT INTO agency_config (id, config_key, config_value) VALUES (?, ?, ?)`, args: [crypto.randomUUID(), "default_logo", ""] });
    }
    const themeCheck = await db.execute({ sql: "SELECT id FROM agency_config WHERE config_key = ?", args: ["default_theme_color"] });
    if (themeCheck.rows.length === 0) {
      await db.execute({ sql: `INSERT INTO agency_config (id, config_key, config_value) VALUES (?, ?, ?)`, args: [crypto.randomUUID(), "default_theme_color", "#475569"] });
    }
  }

  // ── Contract templates table (DocuSeal integration) ─────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      docuseal_template_id  INTEGER NOT NULL,
      service_keys          TEXT,
      is_default            INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Deal contracts table (DocuSeal submissions per deal) ───────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS deal_contracts (
      id                      TEXT PRIMARY KEY,
      deal_id                 TEXT NOT NULL UNIQUE,
      contract_template_id    TEXT REFERENCES contract_templates(id) ON DELETE SET NULL,
      docuseal_submission_id  INTEGER,
      docuseal_submitter_id   INTEGER,
      status                  TEXT NOT NULL DEFAULT 'pending',
      client_email            TEXT,
      signing_url             TEXT,
      sent_at                 TEXT,
      signed_at               TEXT,
      document_urls           TEXT,
      created_by              TEXT,
      created_at              TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_deal_contracts_deal_id ON deal_contracts(deal_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_deal_contracts_status ON deal_contracts(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_deal_contracts_submission_id ON deal_contracts(docuseal_submission_id)`);
  } catch {
    // indexes may already exist
  }

  console.log("[migrate] Database migration complete");
}
