import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import {
  TokenScopes,
  sanitizeScopes,
  sanitizeResourceIds,
} from "./apiScopes";

/**
 * External API bearer tokens (`ac_live_…`) for `/api/v1/*` and `/api/mcp`.
 *
 * Secret handling: the plaintext token is returned exactly once at
 * mint/rotate time and never stored — only a SHA-256 hex digest lands in
 * `api_tokens.token_hash`. SHA-256 (not scrypt) is deliberate: the secret is
 * 32 random bytes (high entropy), so a slow KDF buys nothing and would add
 * ~50–100ms to every API request.
 */

/** `ac_live_` + 8 hex chars — the visible, non-secret row locator. */
const PREFIX_RE = /^ac_live_[0-9a-f]{8}/;
const PREFIX_LENGTH = "ac_live_".length + 8;

export interface ApiTokenRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: TokenScopes;
  clientIds: string[] | null;
  closerIds: string[] | null;
  /** Workspace (book) restriction — null/[] = every book. */
  workspaces: string[] | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTokenUsageDay {
  day: string;
  count: number;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** New plaintext token + its stored parts. Plaintext is never persisted. */
export function generateToken(): { token: string; prefix: string; hash: string } {
  const prefix = `ac_live_${crypto.randomBytes(4).toString("hex")}`;
  // base64url alphabet includes "_", so the prefix is recovered by length,
  // never by splitting on underscores.
  const secret = crypto.randomBytes(32).toString("base64url");
  const token = `${prefix}_${secret}`;
  return { token, prefix, hash: sha256Hex(token) };
}

function parseJsonArray(raw: unknown): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return sanitizeResourceIds(parsed);
  } catch {
    return null;
  }
}

function rowToRecord(row: Record<string, unknown>): ApiTokenRecord {
  let scopes: TokenScopes = {};
  try {
    scopes = sanitizeScopes(JSON.parse(String(row.scopes ?? "{}")));
  } catch {
    scopes = {};
  }
  return {
    id: String(row.id),
    name: String(row.name),
    prefix: String(row.prefix),
    scopes,
    clientIds: parseJsonArray(row.client_ids),
    closerIds: parseJsonArray(row.closer_ids),
    workspaces: parseJsonArray(row.workspaces),
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
    revokedAt: row.revoked_at != null ? String(row.revoked_at) : null,
    lastUsedAt: row.last_used_at != null ? String(row.last_used_at) : null,
    requestCount: Number(row.request_count ?? 0),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdByName: row.created_by_name != null ? String(row.created_by_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface CreateApiTokenInput {
  name: string;
  scopes: TokenScopes;
  clientIds?: string[] | null;
  closerIds?: string[] | null;
  /** Workspace (book) restriction — null/[] = every book. */
  workspaces?: string[] | null;
  /** ISO date/datetime string, or null for no expiry. */
  expiresAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
}

/** Mint a token. Returns the plaintext ONCE — it cannot be re-fetched. */
export async function createApiToken(
  input: CreateApiTokenInput
): Promise<{ record: ApiTokenRecord; token: string }> {
  await ensureMigrated();
  const db = getDb();
  const { token, prefix, hash } = generateToken();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO api_tokens
            (id, name, prefix, token_hash, scopes, client_ids, closer_ids,
             workspaces, expires_at, created_by, created_by_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      prefix,
      hash,
      JSON.stringify(sanitizeScopes(input.scopes)),
      input.clientIds && input.clientIds.length > 0 ? JSON.stringify(input.clientIds) : null,
      input.closerIds && input.closerIds.length > 0 ? JSON.stringify(input.closerIds) : null,
      input.workspaces && input.workspaces.length > 0 ? JSON.stringify(input.workspaces) : null,
      input.expiresAt ?? null,
      input.createdBy ?? null,
      input.createdByName ?? null,
    ],
  });
  const record = await findApiToken(id);
  if (!record) throw new Error("Failed to create API token");
  return { record, token };
}

export async function findApiToken(id: string): Promise<ApiTokenRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM api_tokens WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToRecord(row as Record<string, unknown>) : null;
}

/** All tokens, newest first. Never includes token_hash. */
export async function listApiTokens(): Promise<ApiTokenRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM api_tokens ORDER BY created_at DESC"
  );
  return result.rows.map((row) => rowToRecord(row as Record<string, unknown>));
}

/**
 * Verify a presented bearer token. Returns the record only when the token
 * exists, the hash matches (timing-safe), and it is neither revoked nor
 * expired. All failure modes return null — callers must not distinguish
 * them to avoid an oracle.
 */
export async function verifyApiToken(bearer: string): Promise<ApiTokenRecord | null> {
  const candidate = bearer.trim();
  if (!PREFIX_RE.test(candidate)) return null;
  const prefix = candidate.slice(0, PREFIX_LENGTH);

  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM api_tokens WHERE prefix = ?",
    args: [prefix],
  });
  const row = result.rows[0];
  if (!row) return null;

  const storedHash = String((row as Record<string, unknown>).token_hash ?? "");
  const computed = sha256Hex(candidate);
  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(computed, "hex"),
        Buffer.from(storedHash, "hex")
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const record = rowToRecord(row as Record<string, unknown>);
  if (record.revokedAt) return null;
  if (record.expiresAt) {
    // expires_at is an ISO yyyy-mm-dd (or datetime) string. Normalize both
    // sides to an instant — naive datetimes are treated as UTC; unparseable
    // values fail closed (expired).
    let expiry = record.expiresAt;
    if (expiry.length <= 10) {
      expiry = `${expiry}T23:59:59.999Z`;
    } else if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(expiry)) {
      expiry = `${expiry}Z`;
    }
    const expiryMs = Date.parse(expiry);
    if (Number.isNaN(expiryMs) || expiryMs < Date.now()) return null;
  }
  return record;
}

export async function revokeApiToken(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE api_tokens
          SET revoked_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND revoked_at IS NULL`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Rotate the secret: new prefix + hash on the same row, scopes/limits/usage
 * history preserved. Also clears revoked_at so a rotate re-arms the token.
 * Returns the new plaintext ONCE.
 */
export async function rotateApiToken(
  id: string
): Promise<{ record: ApiTokenRecord; token: string } | null> {
  await ensureMigrated();
  const db = getDb();
  const { token, prefix, hash } = generateToken();
  const result = await db.execute({
    sql: `UPDATE api_tokens
          SET prefix = ?, token_hash = ?, revoked_at = NULL,
              updated_at = datetime('now')
          WHERE id = ?`,
    args: [prefix, hash, id],
  });
  if ((result.rowsAffected ?? 0) === 0) return null;
  const record = await findApiToken(id);
  if (!record) return null;
  return { record, token };
}

export interface UpdateApiTokenInput {
  name?: string;
  scopes?: TokenScopes;
  clientIds?: string[] | null;
  closerIds?: string[] | null;
  workspaces?: string[] | null;
  expiresAt?: string | null;
}

/** Partial update of name/scopes/resource lists/expiry. */
export async function updateApiToken(
  id: string,
  input: UpdateApiTokenInput
): Promise<ApiTokenRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    args.push(input.name);
  }
  if (input.scopes !== undefined) {
    sets.push("scopes = ?");
    args.push(JSON.stringify(sanitizeScopes(input.scopes)));
  }
  if (input.clientIds !== undefined) {
    sets.push("client_ids = ?");
    args.push(
      input.clientIds && input.clientIds.length > 0
        ? JSON.stringify(input.clientIds)
        : null
    );
  }
  if (input.closerIds !== undefined) {
    sets.push("closer_ids = ?");
    args.push(
      input.closerIds && input.closerIds.length > 0
        ? JSON.stringify(input.closerIds)
        : null
    );
  }
  if (input.workspaces !== undefined) {
    sets.push("workspaces = ?");
    args.push(
      input.workspaces && input.workspaces.length > 0
        ? JSON.stringify(input.workspaces)
        : null
    );
  }
  if (input.expiresAt !== undefined) {
    sets.push("expires_at = ?");
    args.push(input.expiresAt);
  }
  if (sets.length === 0) return findApiToken(id);
  sets.push("updated_at = datetime('now')");
  const result = await db.execute({
    sql: `UPDATE api_tokens SET ${sets.join(", ")} WHERE id = ?`,
    args: [...args, id],
  });
  if ((result.rowsAffected ?? 0) === 0) return null;
  return findApiToken(id);
}

export async function deleteApiToken(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const results = await db.batch(
    [
      { sql: "DELETE FROM api_token_usage WHERE token_id = ?", args: [id] },
      { sql: "DELETE FROM api_tokens WHERE id = ?", args: [id] },
    ],
    "write"
  );
  return (results[1]?.rowsAffected ?? 0) > 0;
}

/**
 * Bump last_used_at / request_count and the per-day usage rollup. Called
 * fire-and-forget from the auth guard — failures must never fail a request.
 */
export async function bumpTokenUsage(id: string): Promise<void> {
  try {
    const db = getDb();
    await db.batch(
      [
        {
          sql: `UPDATE api_tokens
                SET last_used_at = datetime('now'),
                    request_count = request_count + 1
                WHERE id = ?`,
          args: [id],
        },
        {
          sql: `INSERT INTO api_token_usage (token_id, day, count)
                VALUES (?, date('now'), 1)
                ON CONFLICT(token_id, day) DO UPDATE SET count = count + 1`,
          args: [id],
        },
      ],
      "write"
    );
  } catch (err) {
    console.error("[apiTokens] usage bump failed:", err);
  }
}

/** Per-day usage rows for the last `days` days, oldest first. */
export async function getTokenUsage(
  id: string,
  days = 30
): Promise<ApiTokenUsageDay[]> {
  await ensureMigrated();
  const db = getDb();
  const modifier = `-${Math.max(1, Math.floor(days))} days`;
  const result = await db.execute({
    sql: `SELECT day, count FROM api_token_usage
          WHERE token_id = ? AND day >= date('now', ?)
          ORDER BY day ASC`,
    args: [id, modifier],
  });
  return result.rows.map((row) => ({
    day: String(row.day),
    count: Number(row.count ?? 0),
  }));
}
