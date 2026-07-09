import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import { RESOURCE_KEYS } from "./apiScopes";

/**
 * Minimal OAuth 2.1 authorization server so the MCP endpoint can be added as
 * a Claude.ai (and other MCP clients') custom connector — those clients only
 * speak OAuth, never static bearer tokens. The flow is authorization-code +
 * PKCE (S256, public clients, no secret): dynamic client registration →
 * admin-approved consent (which mints a REGULAR `api_tokens` row scoped in
 * the consent UI) → code exchange returns that `ac_live_…` token as the
 * OAuth access token. Everything downstream (verifyApiToken, scopes, rate
 * limit, usage, revocation from /dashboard/api-tokens) is untouched.
 *
 * Codes are single-use, expire in 10 minutes, and carry the minted token
 * AES-256-GCM-encrypted (key derived from SESSION_SECRET) until redemption.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;

export interface OAuthClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  createdAt: string;
}

/* ── Encryption (same construction as lib/google/tokenStorage) ─────── */

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for OAuth code encryption");
  cachedKey = crypto.scryptSync(secret, "oauth-code-salt", 32);
  return cachedKey;
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(encoded: string): string {
  const [ivHex, tagHex, dataHex] = encoded.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/* ── Clients (RFC 7591 dynamic registration) ───────────────────────── */

/** https only, except loopback for local development. */
export function isAllowedRedirectUri(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function registerOAuthClient(input: {
  clientName?: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  await ensureMigrated();
  const db = getDb();
  const clientId = `mcp_${crypto.randomBytes(16).toString("hex")}`;
  const clientName = input.clientName?.trim().slice(0, 200) || null;
  const redirectUris = input.redirectUris.slice(0, MAX_REDIRECT_URIS);
  await db.execute({
    sql: `INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)`,
    args: [clientId, clientName, JSON.stringify(redirectUris)],
  });
  return { clientId, clientName, redirectUris, createdAt: new Date().toISOString() };
}

export async function findOAuthClient(clientId: string): Promise<OAuthClient | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM oauth_clients WHERE client_id = ?",
    args: [clientId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  let redirectUris: string[] = [];
  try {
    const parsed = JSON.parse(String(row.redirect_uris));
    if (Array.isArray(parsed)) redirectUris = parsed.filter((u): u is string => typeof u === "string");
  } catch {
    // corrupt row — treat as no registered URIs (nothing will match)
  }
  return {
    clientId: String(row.client_id),
    clientName: row.client_name != null ? String(row.client_name) : null,
    redirectUris,
    createdAt: String(row.created_at),
  };
}

/* ── Authorization codes (PKCE S256, single-use) ───────────────────── */

export async function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  apiTokenId: string;
  /** The freshly minted plaintext token — encrypted at rest until exchange. */
  accessToken: string;
}): Promise<string> {
  await ensureMigrated();
  const db = getDb();
  // Opportunistic purge — abandoned/denied consents otherwise accumulate
  // rows holding encrypted tokens forever (fire-and-forget).
  db.execute({
    sql: "DELETE FROM oauth_codes WHERE expires_at < ?",
    args: [new Date().toISOString()],
  }).catch(() => {});
  const code = crypto.randomBytes(32).toString("base64url");
  await db.execute({
    sql: `INSERT INTO oauth_codes
            (code, client_id, redirect_uri, code_challenge, token_ciphertext, api_token_id, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      code,
      input.clientId,
      input.redirectUri,
      input.codeChallenge,
      encrypt(input.accessToken),
      input.apiTokenId,
      new Date(Date.now() + CODE_TTL_MS).toISOString(),
    ],
  });
  return code;
}

export type RedeemResult =
  | { ok: true; accessToken: string; apiTokenId: string }
  | { ok: false; error: "invalid_grant" };

/**
 * Redeem a code: deleted FIRST (single-use even on failure), then expiry,
 * client, redirect_uri, and PKCE S256 challenge are all verified.
 */
export async function redeemAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<RedeemResult> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM oauth_codes WHERE code = ?",
    args: [input.code],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "invalid_grant" };
  // The DELETE is the single-use gate: under concurrent redemption both
  // requests can SELECT the row, but only one deletes it — the loser bails.
  const deleted = await db.execute({
    sql: "DELETE FROM oauth_codes WHERE code = ?",
    args: [input.code],
  });
  if ((deleted.rowsAffected ?? 0) !== 1) return { ok: false, error: "invalid_grant" };

  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "invalid_grant" };
  }
  if (String(row.client_id) !== input.clientId) return { ok: false, error: "invalid_grant" };
  if (String(row.redirect_uri) !== input.redirectUri) return { ok: false, error: "invalid_grant" };

  const expected = crypto
    .createHash("sha256")
    .update(input.codeVerifier)
    .digest("base64url");
  const challenge = String(row.code_challenge);
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_grant" };
  }

  try {
    return {
      ok: true,
      accessToken: decrypt(String(row.token_ciphertext)),
      apiTokenId: String(row.api_token_id),
    };
  } catch {
    return { ok: false, error: "invalid_grant" };
  }
}

/* ── Discovery metadata ────────────────────────────────────────────── */

/** All grantable scope strings, advertised in both metadata documents. */
export function supportedScopes(): string[] {
  return RESOURCE_KEYS.flatMap((r) =>
    r === "audit" ? [`${r}:read`] : [`${r}:read`, `${r}:write`, `${r}:delete`]
  );
}

/** RFC 8414 authorization-server metadata (issuer = the public origin). */
export function authServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: supportedScopes(),
  };
}
