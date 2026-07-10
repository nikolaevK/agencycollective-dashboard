import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Meta Accounts — inventory of aged Facebook accounts being provisioned and
// warmed into Meta ad accounts (the Meta Accounts Directory). Raw parameterized
// SQL over the meta_accounts table (see lib/db.ts). Credentials are stored
// as-is by product decision (mirrors the spreadsheets this replaces); the whole
// surface is gated by the `meta_accounts` permission.
//
// stage / status hold a meta_account_options `value` slug (lib/metaAccountOptions.ts).
// clientId is an optional link to a client (users.id).
// ---------------------------------------------------------------------------

export interface MetaAccount {
  id: string;
  fbEmail: string;
  fbPassword: string | null;
  twofaSecret: string | null;
  twofaLink: string | null;
  mailPassword: string | null;
  recoveryEmail: string | null;
  profileLink: string | null;
  bmId: string | null;
  loginOk: boolean;
  pageMade: boolean;
  adAccountMade: boolean;
  bmMade: boolean;
  cardAdded: boolean;
  stage: string | null;
  status: string | null;
  assignee: string | null;
  clientId: string | null;
  batch: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** All writable fields (everything except id/createdAt/updatedAt). */
export interface MetaAccountInput {
  fbEmail?: string;
  fbPassword?: string | null;
  twofaSecret?: string | null;
  twofaLink?: string | null;
  mailPassword?: string | null;
  recoveryEmail?: string | null;
  profileLink?: string | null;
  bmId?: string | null;
  loginOk?: boolean;
  pageMade?: boolean;
  adAccountMade?: boolean;
  bmMade?: boolean;
  cardAdded?: boolean;
  stage?: string | null;
  status?: string | null;
  assignee?: string | null;
  clientId?: string | null;
  batch?: string | null;
  notes?: string | null;
}

/**
 * External-API view of an account: credential fields are WRITE-ONLY over
 * /api/v1 + MCP — accepted on create/update/import but never returned.
 * Only the perm-gated admin dashboard reads them back.
 */
export type RedactedMetaAccount = Omit<
  MetaAccount,
  "fbPassword" | "twofaSecret" | "twofaLink" | "mailPassword" | "recoveryEmail"
>;

export function redactMetaAccount(account: MetaAccount): RedactedMetaAccount {
  const { fbPassword, twofaSecret, twofaLink, mailPassword, recoveryEmail, ...safe } = account;
  void fbPassword; void twofaSecret; void twofaLink; void mailPassword; void recoveryEmail;
  return safe;
}

/**
 * Whitelist an arbitrary JSON body down to MetaAccountInput (presence in the
 * body = intent to set). Booleans must be real booleans; other fields accept
 * string or null (trimmed/nulled at write time). Unknown keys are dropped.
 */
export function readMetaAccountInput(body: Record<string, unknown>): MetaAccountInput {
  const input: MetaAccountInput = {};
  for (const key of Object.keys(COLUMN_BY_FIELD) as (keyof MetaAccountInput)[]) {
    if (!(key in body)) continue;
    const value = body[key];
    if (BOOLEAN_FIELDS.has(key)) {
      if (typeof value === "boolean") (input as Record<string, unknown>)[key] = value;
    } else if (value === null || typeof value === "string") {
      (input as Record<string, unknown>)[key] = value;
    }
  }
  return input;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function bool(v: unknown): boolean {
  return Number(v ?? 0) === 1;
}

function rowToMetaAccount(row: Row): MetaAccount {
  return {
    id: String(row.id),
    fbEmail: row.fb_email != null ? String(row.fb_email) : "",
    fbPassword: row.fb_password != null ? String(row.fb_password) : null,
    twofaSecret: row.twofa_secret != null ? String(row.twofa_secret) : null,
    twofaLink: row.twofa_link != null ? String(row.twofa_link) : null,
    mailPassword: row.mail_password != null ? String(row.mail_password) : null,
    recoveryEmail: row.recovery_email != null ? String(row.recovery_email) : null,
    profileLink: row.profile_link != null ? String(row.profile_link) : null,
    bmId: row.bm_id != null ? String(row.bm_id) : null,
    loginOk: bool(row.login_ok),
    pageMade: bool(row.page_made),
    adAccountMade: bool(row.ad_account_made),
    bmMade: bool(row.bm_made),
    cardAdded: bool(row.card_added),
    stage: row.stage != null ? String(row.stage) : null,
    status: row.status != null ? String(row.status) : null,
    assignee: row.assignee != null ? String(row.assignee) : null,
    clientId: row.client_id != null ? String(row.client_id) : null,
    batch: row.batch != null ? String(row.batch) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listMetaAccounts(): Promise<MetaAccount[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute(
      "SELECT * FROM meta_accounts ORDER BY created_at DESC, fb_email"
    );
    return result.rows.map(rowToMetaAccount);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(msg)) return [];
    throw err;
  }
}

export async function getMetaAccount(id: string): Promise<MetaAccount | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM meta_accounts WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToMetaAccount(result.rows[0]) : null;
}

/** Column order shared by createMetaAccount and bulkCreateMetaAccounts. */
const INSERT_COLUMNS = [
  "id",
  "fb_email",
  "fb_password",
  "twofa_secret",
  "twofa_link",
  "mail_password",
  "recovery_email",
  "profile_link",
  "bm_id",
  "login_ok",
  "page_made",
  "ad_account_made",
  "bm_made",
  "card_added",
  "stage",
  "status",
  "assignee",
  "client_id",
  "batch",
  "notes",
  "created_at",
  "updated_at",
] as const;

/** Normalize an input into the full row that will be inserted. */
function buildMetaAccount(input: MetaAccountInput, now: string): MetaAccount {
  return {
    id: crypto.randomUUID(),
    fbEmail: str(input.fbEmail) ?? "",
    fbPassword: str(input.fbPassword),
    twofaSecret: str(input.twofaSecret),
    twofaLink: str(input.twofaLink),
    mailPassword: str(input.mailPassword),
    recoveryEmail: str(input.recoveryEmail),
    profileLink: str(input.profileLink),
    bmId: str(input.bmId),
    loginOk: !!input.loginOk,
    pageMade: !!input.pageMade,
    adAccountMade: !!input.adAccountMade,
    bmMade: !!input.bmMade,
    cardAdded: !!input.cardAdded,
    stage: str(input.stage),
    status: str(input.status),
    assignee: str(input.assignee),
    clientId: str(input.clientId),
    batch: str(input.batch),
    notes: str(input.notes),
    createdAt: now,
    updatedAt: now,
  };
}

function insertArgs(account: MetaAccount): (string | number | null)[] {
  return [
    account.id,
    account.fbEmail,
    account.fbPassword,
    account.twofaSecret,
    account.twofaLink,
    account.mailPassword,
    account.recoveryEmail,
    account.profileLink,
    account.bmId,
    account.loginOk ? 1 : 0,
    account.pageMade ? 1 : 0,
    account.adAccountMade ? 1 : 0,
    account.bmMade ? 1 : 0,
    account.cardAdded ? 1 : 0,
    account.stage,
    account.status,
    account.assignee,
    account.clientId,
    account.batch,
    account.notes,
    account.createdAt,
    account.updatedAt,
  ];
}

const PLACEHOLDERS = INSERT_COLUMNS.map(() => "?").join(", ");
const INSERT_SQL = `INSERT INTO meta_accounts (${INSERT_COLUMNS.join(", ")}) VALUES (${PLACEHOLDERS})`;
// Import path: the unique email index (idx_meta_accounts_email, lib/db.ts) is
// the race-proof backstop behind the app-level de-dupe — conflicting rows are
// skipped, not errored, and rowsAffected reports what actually landed.
const INSERT_OR_IGNORE_SQL = INSERT_SQL.replace("INSERT INTO", "INSERT OR IGNORE INTO");

/** Thrown when a write collides with the unique fb_email index. */
export class DuplicateMetaAccountEmailError extends Error {
  constructor() {
    super("An account with this email already exists");
  }
}

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /unique constraint|constraint failed/i.test(msg);
}

export async function createMetaAccount(input: MetaAccountInput): Promise<MetaAccount> {
  await ensureMigrated();
  const db = getDb();
  // The inserted row is fully known in-process — no re-fetch round-trip.
  const account = buildMetaAccount(input, new Date().toISOString());
  try {
    await db.execute({ sql: INSERT_SQL, args: insertArgs(account) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateMetaAccountEmailError();
    throw err;
  }
  return account;
}

/** Bulk insert (import). One atomic batch; returns the number of rows actually inserted. */
export async function bulkCreateMetaAccounts(inputs: MetaAccountInput[]): Promise<number> {
  await ensureMigrated();
  if (inputs.length === 0) return 0;
  const db = getDb();
  const now = new Date().toISOString();
  const stmts = inputs.map((input) => ({
    sql: INSERT_OR_IGNORE_SQL,
    args: insertArgs(buildMetaAccount(input, now)),
  }));
  const results = await db.batch(stmts, "write");
  return results.reduce((n, r) => n + (r.rowsAffected ?? 0), 0);
}

/** Lowercased fb_email set for import de-dupe — one column, not SELECT *. */
export async function listMetaAccountEmails(): Promise<Set<string>> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute("SELECT fb_email FROM meta_accounts");
    return new Set(
      result.rows.map((r) => String(r.fb_email ?? "").trim().toLowerCase()).filter(Boolean)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(msg)) return new Set();
    throw err;
  }
}

export interface MetaAccountQuery {
  stage?: string;
  status?: string;
  batch?: string;
  clientId?: string;
  limit: number;
  offset: number;
}

/** Filtered + paginated read for the external API — WHERE/LIMIT in SQL, rows + total in one batch round-trip. */
export async function queryMetaAccounts(
  q: MetaAccountQuery
): Promise<{ rows: MetaAccount[]; total: number }> {
  await ensureMigrated();
  const db = getDb();
  const where: string[] = [];
  const args: string[] = [];
  if (q.stage) { where.push("stage = ?"); args.push(q.stage); }
  if (q.status) { where.push("status = ?"); args.push(q.status); }
  if (q.batch) { where.push("batch = ?"); args.push(q.batch); }
  if (q.clientId) { where.push("client_id = ?"); args.push(q.clientId); }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  try {
    const [rowsRes, countRes] = await db.batch(
      [
        {
          sql: `SELECT * FROM meta_accounts${whereSql} ORDER BY created_at DESC, fb_email LIMIT ? OFFSET ?`,
          args: [...args, q.limit, q.offset],
        },
        { sql: `SELECT COUNT(*) AS n FROM meta_accounts${whereSql}`, args },
      ],
      "read"
    );
    return {
      rows: rowsRes.rows.map(rowToMetaAccount),
      total: Number(countRes.rows[0]?.n ?? 0),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(msg)) return { rows: [], total: 0 };
    throw err;
  }
}

const COLUMN_BY_FIELD: Record<keyof MetaAccountInput, string> = {
  fbEmail: "fb_email",
  fbPassword: "fb_password",
  twofaSecret: "twofa_secret",
  twofaLink: "twofa_link",
  mailPassword: "mail_password",
  recoveryEmail: "recovery_email",
  profileLink: "profile_link",
  bmId: "bm_id",
  loginOk: "login_ok",
  pageMade: "page_made",
  adAccountMade: "ad_account_made",
  bmMade: "bm_made",
  cardAdded: "card_added",
  stage: "stage",
  status: "status",
  assignee: "assignee",
  clientId: "client_id",
  batch: "batch",
  notes: "notes",
};

const BOOLEAN_FIELDS = new Set<keyof MetaAccountInput>([
  "loginOk",
  "pageMade",
  "adAccountMade",
  "bmMade",
  "cardAdded",
]);

export async function updateMetaAccount(
  id: string,
  changes: MetaAccountInput
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  for (const key of Object.keys(changes) as (keyof MetaAccountInput)[]) {
    const column = COLUMN_BY_FIELD[key];
    if (!column) continue;
    const value = changes[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    if (BOOLEAN_FIELDS.has(key)) {
      args.push(value ? 1 : 0);
    } else if (key === "fbEmail") {
      args.push(str(value) ?? "");
    } else {
      args.push(str(value));
    }
  }

  if (fields.length === 0) return false;
  fields.push("updated_at = ?");
  args.push(new Date().toISOString());
  args.push(id);

  try {
    const result = await db.execute({
      sql: `UPDATE meta_accounts SET ${fields.join(", ")} WHERE id = ?`,
      args,
    });
    return (result.rowsAffected ?? 0) > 0;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateMetaAccountEmailError();
    throw err;
  }
}

export async function deleteMetaAccount(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM meta_accounts WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
