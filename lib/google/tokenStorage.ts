import crypto from "crypto";
import { getDb, ensureMigrated } from "../db";
import { refreshAccessToken } from "./oauth";

// ── Token encryption at rest ──────────────────────────────────────────
// Encrypts OAuth tokens using AES-256-GCM with a key derived from SESSION_SECRET.

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for token encryption");
  return crypto.scryptSync(secret, "google-token-salt", 32);
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  // Our format is iv:tag:ciphertext, all lowercase hex. Anything else is a
  // legacy plaintext token stored before encryption was added — return it
  // unchanged. If it *looks* like our format but fails to decrypt, throw
  // loudly so we never send ciphertext to Google as if it were a plaintext
  // refresh_token (that silently-swallowed failure was a real production bug).
  const isOurFormat = parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
  if (!isOurFormat) return encoded;

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return decipher.update(ciphertext) + decipher.final("utf8");
  } catch {
    throw new Error(
      "Failed to decrypt Google Calendar token. SESSION_SECRET likely differs from the one that stored it — reconnect Google Calendar for this environment."
    );
  }
}

/**
 * NODE_ENV-keyed scope, so dev and prod coexist on the same Turso database
 * instead of thrashing each other's tokens. Unknown values fall back to
 * "development" (never inherit prod's row by accident).
 */
function getScope(): string {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

// ── Types ─────────────────────────────────────────────────────────────

export interface CalendarConfig {
  id: number;
  label: string;
  email: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix timestamp in seconds
  calendarId: string;
  connectedBy: string;
}

// ── CRUD ──────────────────────────────────────────────────────────────

export async function saveCalendarConfig(
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
  email: string | null,
  connectedBy: string
): Promise<void> {
  await ensureMigrated();
  const db = getDb();

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing access_token or refresh_token");
  }

  const expiresAt = tokens.expiry_date
    ? Math.floor(tokens.expiry_date / 1000)
    : Math.floor(Date.now() / 1000) + 3600;

  const scope = getScope();

  // Only delete the row for this scope — leaves the other environment's
  // connection intact.
  await db.execute({
    sql: "DELETE FROM google_calendar_config WHERE scope = ?",
    args: [scope],
  });

  await db.execute({
    sql: `INSERT INTO google_calendar_config (label, email, access_token, refresh_token, expires_at, calendar_id, connected_by, scope)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "Main Calendar",
      email,
      encrypt(tokens.access_token),
      encrypt(tokens.refresh_token),
      expiresAt,
      "primary",
      connectedBy,
      scope,
    ],
  });
}

export async function getCalendarConfig(): Promise<CalendarConfig | null> {
  await ensureMigrated();
  const db = getDb();
  const scope = getScope();
  const result = await db.execute({
    sql: "SELECT * FROM google_calendar_config WHERE scope = ? LIMIT 1",
    args: [scope],
  });
  const row = result.rows[0];
  if (!row) return null;

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decrypt(String(row.access_token));
    refreshToken = decrypt(String(row.refresh_token));
  } catch (err) {
    // Decryption failed for what looked like a properly-encrypted token. The
    // row is unusable in this environment — report as "not connected" so the
    // UI prompts a fresh Google connect instead of trying to refresh garbage.
    console.error("[google] Calendar token unreadable in this environment:", err instanceof Error ? err.message : err);
    return null;
  }

  const config: CalendarConfig = {
    id: Number(row.id),
    label: String(row.label),
    email: row.email != null ? String(row.email) : null,
    accessToken,
    refreshToken,
    expiresAt: Number(row.expires_at),
    calendarId: String(row.calendar_id),
    connectedBy: String(row.connected_by),
  };

  // Auto-refresh if expired (with 5 min buffer)
  const now = Math.floor(Date.now() / 1000);
  if (config.expiresAt < now + 300) {
    try {
      const refreshed = await refreshAccessToken(config.refreshToken);
      if (refreshed.access_token) {
        const newExpiresAt = refreshed.expiry_date
          ? Math.floor(refreshed.expiry_date / 1000)
          : now + 3600;

        await db.execute({
          sql: `UPDATE google_calendar_config SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [encrypt(refreshed.access_token), newExpiresAt, config.id],
        });

        config.accessToken = refreshed.access_token;
        config.expiresAt = newExpiresAt;
      }
    } catch (err) {
      console.error("[google] Failed to refresh token:", err);
    }
  }

  return config;
}

export async function deleteCalendarConfig(): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM google_calendar_config WHERE scope = ?",
    args: [getScope()],
  });
}

export async function isCalendarConnected(): Promise<{ connected: boolean; email?: string }> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT email FROM google_calendar_config WHERE scope = ? LIMIT 1",
    args: [getScope()],
  });
  if (result.rows.length === 0) return { connected: false };
  return {
    connected: true,
    email: result.rows[0].email != null ? String(result.rows[0].email) : undefined,
  };
}
