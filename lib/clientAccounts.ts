import { getDb } from "./db";
import type { Row } from "@libsql/client";
import { normalizeAccountId } from "./users";

export interface ClientAccount {
  id: number;
  userId: string;
  accountId: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToClientAccount(row: Row): ClientAccount {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    accountId: String(row.account_id),
    label: row.label != null ? String(row.label) : null,
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readAccountsForUser(userId: string): Promise<ClientAccount[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM client_accounts WHERE user_id = ? ORDER BY created_at",
    args: [userId],
  });
  return result.rows.map(rowToClientAccount);
}

export async function readActiveAccountsForUser(userId: string): Promise<ClientAccount[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM client_accounts WHERE user_id = ? AND is_active = 1 ORDER BY created_at",
    args: [userId],
  });
  return result.rows.map(rowToClientAccount);
}

/**
 * Resolve which ad account a portal request should target:
 *   1. a validated, requested account id (client-side selection), else
 *   2. the legacy/default `account_id` (when set), else
 *   3. the first active linked account, else
 *   4. "" — the client has no ad accounts connected yet.
 *
 * Returns the active linked accounts alongside, so callers can look up labels
 * and distinguish "no accounts" (accountId === "") from a normal fetch. This is
 * the single place that knows how to find a portal user's account, so a client
 * created via the Client Directory (legacy `account_id` = "") still resolves to
 * its linked account instead of falling through to Meta as `act_`.
 */
export async function resolvePortalAccountId(
  userId: string,
  defaultAccountId: string,
  requestedAccountId: string | null
): Promise<{ accountId: string; accounts: ClientAccount[] }> {
  const accounts = await readActiveAccountsForUser(userId);
  let accountId = defaultAccountId || "";
  if (requestedAccountId && accounts.some((a) => a.accountId === requestedAccountId)) {
    accountId = requestedAccountId;
  } else if (!accountId && accounts.length > 0) {
    accountId = accounts[0].accountId;
  }
  return { accountId, accounts };
}

export async function readAllClientAccounts(): Promise<ClientAccount[]> {
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM client_accounts ORDER BY user_id, created_at"
  );
  return result.rows.map(rowToClientAccount);
}

export async function countAllClientAccounts(): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    "SELECT COUNT(DISTINCT account_id) as cnt FROM client_accounts"
  );
  return Number(result.rows[0]?.cnt ?? 0);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function addAccountToUser(
  userId: string,
  accountId: string,
  label?: string
): Promise<void> {
  const db = getDb();
  const normalized = normalizeAccountId(accountId);
  await db.execute({
    sql: `INSERT OR IGNORE INTO client_accounts (user_id, account_id, label, is_active)
          VALUES (?, ?, ?, 1)`,
    args: [userId, normalized, label ?? null],
  });
}

export async function removeAccountFromUser(
  userId: string,
  accountId: string
): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM client_accounts WHERE user_id = ? AND account_id = ?",
    args: [userId, accountId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function toggleAccountActive(
  userId: string,
  accountId: string,
  isActive: boolean
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE client_accounts SET is_active = ? WHERE user_id = ? AND account_id = ?",
    args: [isActive ? 1 : 0, userId, accountId],
  });
}

export async function updateAccountLabel(
  userId: string,
  accountId: string,
  label: string | null
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE client_accounts SET label = ? WHERE user_id = ? AND account_id = ?",
    args: [label, userId, accountId],
  });
}
