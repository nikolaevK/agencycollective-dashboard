import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdAccountStatus = "active" | "inactive";

/**
 * An agency ad account a client can optionally purchase. One row = one account,
 * optionally linked to one client (`userId` null = unattached). The ad-spend
 * fee is stored in basis points (200–700 = 2–7% in 0.5% steps); the monthly
 * retainer in cents. Both billing knobs live on the row (set at assignment).
 */
export interface AdAccount {
  id: string;
  userId: string | null;
  /** Workspace (book) slug — 'main' is the original Agency Collective book. */
  workspace: string;
  accountName: string;
  vendor: string | null;
  platform: string | null;
  adSpendFeeBps: number;
  monthlyRetainerCents: number;
  status: AdAccountStatus;
  notes: string | null;
  // Billing-schedule controls (mirror client_billing; drive computeRebillSchedule)
  billingPaused: boolean;
  billingDay: number | null; // 1-31; null = derive from createdAt
  leadDays: number;
  extendUntil: string | null; // yyyy-mm-dd
  lastBilledOverride: string | null; // yyyy-mm-dd — manual last-billed
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_LEAD_DAYS = 5;

/** Clamp a day-of-month to 1-31, or null. */
function normalizeBillingDay(day: number | null | undefined): number | null {
  if (day == null) return null;
  if (!Number.isFinite(day)) return null;
  return Math.min(31, Math.max(1, Math.round(day)));
}

// Ad-spend fee bounds: 2%–7% in 0.5% steps, stored as basis points.
export const MIN_FEE_BPS = 200;
export const MAX_FEE_BPS = 700;
export const FEE_STEP_BPS = 50;

/** Clamp + snap an ad-spend fee to the allowed [200,700] / 50-bps grid. */
export function normalizeFeeBps(bps: number): number {
  const rounded = Math.round(bps / FEE_STEP_BPS) * FEE_STEP_BPS;
  return Math.min(MAX_FEE_BPS, Math.max(MIN_FEE_BPS, rounded));
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToAdAccount(row: Row): AdAccount {
  const status = String(row.status ?? "active");
  return {
    id: String(row.id),
    userId: row.user_id != null ? String(row.user_id) : null,
    workspace:
      row.workspace != null && String(row.workspace) !== "" ? String(row.workspace) : "main",
    accountName: String(row.account_name ?? ""),
    vendor: row.vendor != null ? String(row.vendor) : null,
    platform: row.platform != null ? String(row.platform) : null,
    adSpendFeeBps: Number(row.ad_spend_fee_bps ?? MIN_FEE_BPS),
    monthlyRetainerCents: Number(row.monthly_retainer_cents ?? 0),
    status: status === "inactive" ? "inactive" : "active",
    notes: row.notes != null ? String(row.notes) : null,
    billingPaused: Number(row.billing_paused ?? 0) === 1,
    billingDay: row.billing_day != null ? Number(row.billing_day) : null,
    leadDays: Number(row.lead_days ?? DEFAULT_LEAD_DAYS),
    extendUntil: row.extend_until != null ? String(row.extend_until) : null,
    lastBilledOverride:
      row.last_billed_override != null ? String(row.last_billed_override) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listAdAccounts(): Promise<AdAccount[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM ad_accounts ORDER BY created_at DESC"
  );
  return result.rows.map(rowToAdAccount);
}

export async function getAdAccount(id: string): Promise<AdAccount | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM ad_accounts WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToAdAccount(result.rows[0]) : null;
}

export async function listAdAccountsForUser(
  userId: string
): Promise<AdAccount[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM ad_accounts WHERE user_id = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return result.rows.map(rowToAdAccount);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface AdAccountBillingInput {
  billingPaused?: boolean;
  billingDay?: number | null;
  leadDays?: number;
  extendUntil?: string | null;
  lastBilledOverride?: string | null;
}

export interface CreateAdAccountInput extends AdAccountBillingInput {
  userId?: string | null;
  workspace?: string;
  accountName: string;
  vendor?: string | null;
  platform?: string | null;
  adSpendFeeBps?: number;
  monthlyRetainerCents?: number;
  status?: AdAccountStatus;
  notes?: string | null;
}

export async function createAdAccount(
  input: CreateAdAccountInput
): Promise<AdAccount> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const feeBps = normalizeFeeBps(input.adSpendFeeBps ?? 350);
  const retainer = Math.max(0, Math.round(input.monthlyRetainerCents ?? 0));
  const status: AdAccountStatus = input.status === "inactive" ? "inactive" : "active";
  const billingPaused = input.billingPaused ? 1 : 0;
  const billingDay = normalizeBillingDay(input.billingDay);
  const leadDays = Number.isFinite(input.leadDays)
    ? Math.max(0, Math.round(input.leadDays as number))
    : DEFAULT_LEAD_DAYS;
  const extendUntil = input.extendUntil?.trim() || null;
  const lastBilledOverride = input.lastBilledOverride?.trim() || null;
  const workspace = input.workspace?.trim() || "main";

  await db.execute({
    sql: `INSERT INTO ad_accounts (
            id, user_id, account_name, vendor, platform,
            ad_spend_fee_bps, monthly_retainer_cents, status, notes,
            billing_paused, billing_day, lead_days, extend_until, last_billed_override,
            workspace, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.userId ?? null,
      input.accountName.trim(),
      input.vendor?.trim() || null,
      input.platform?.trim() || null,
      feeBps,
      retainer,
      status,
      input.notes?.trim() || null,
      billingPaused,
      billingDay,
      leadDays,
      extendUntil,
      lastBilledOverride,
      workspace,
      now,
      now,
    ],
  });

  return {
    id,
    userId: input.userId ?? null,
    workspace,
    accountName: input.accountName.trim(),
    vendor: input.vendor?.trim() || null,
    platform: input.platform?.trim() || null,
    adSpendFeeBps: feeBps,
    monthlyRetainerCents: retainer,
    status,
    notes: input.notes?.trim() || null,
    billingPaused: billingPaused === 1,
    billingDay,
    leadDays,
    extendUntil,
    lastBilledOverride,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateAdAccountInput extends AdAccountBillingInput {
  userId?: string | null;
  workspace?: string;
  accountName?: string;
  vendor?: string | null;
  platform?: string | null;
  adSpendFeeBps?: number;
  monthlyRetainerCents?: number;
  status?: AdAccountStatus;
  notes?: string | null;
}

export async function updateAdAccount(
  id: string,
  changes: UpdateAdAccountInput
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (col: string, val: string | number | null) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };

  if (changes.userId !== undefined) set("user_id", changes.userId ?? null);
  if (changes.workspace !== undefined) set("workspace", changes.workspace.trim() || "main");
  if (changes.accountName !== undefined) set("account_name", changes.accountName.trim());
  if (changes.vendor !== undefined) set("vendor", changes.vendor?.trim() || null);
  if (changes.platform !== undefined) set("platform", changes.platform?.trim() || null);
  if (changes.adSpendFeeBps !== undefined)
    set("ad_spend_fee_bps", normalizeFeeBps(changes.adSpendFeeBps));
  if (changes.monthlyRetainerCents !== undefined)
    set("monthly_retainer_cents", Math.max(0, Math.round(changes.monthlyRetainerCents)));
  if (changes.status !== undefined)
    set("status", changes.status === "inactive" ? "inactive" : "active");
  if (changes.notes !== undefined) set("notes", changes.notes?.trim() || null);
  if (changes.billingPaused !== undefined)
    set("billing_paused", changes.billingPaused ? 1 : 0);
  if (changes.billingDay !== undefined)
    set("billing_day", normalizeBillingDay(changes.billingDay));
  if (changes.leadDays !== undefined)
    set("lead_days", Math.max(0, Math.round(changes.leadDays)));
  if (changes.extendUntil !== undefined)
    set("extend_until", changes.extendUntil?.trim() || null);
  if (changes.lastBilledOverride !== undefined)
    set("last_billed_override", changes.lastBilledOverride?.trim() || null);

  if (fields.length === 0) return false;
  fields.push("updated_at = ?");
  args.push(new Date().toISOString());
  args.push(id);

  const result = await db.execute({
    sql: `UPDATE ad_accounts SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function deleteAdAccount(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM ad_accounts WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
