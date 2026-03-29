import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayDistributed = "Yes" | "No" | "Hold Til Full Pay";

export interface SplitParty {
  name: string;
  pct: number;
}

export interface PayoutRecord {
  id: string;
  payoutMonth: number;
  payoutYear: number;
  dateJoined: string | null;
  firstDayAdSpend: string | null;
  brandName: string;
  vertical: string | null;
  pointOfContact: string | null;
  service: string | null;
  isSigned: boolean;
  isPaid: boolean;
  addedToSlack: boolean;
  amountDue: number; // cents
  amountPaid: number; // cents
  paymentNotes: string | null;
  salesRep: string | null;
  payDistributed: PayDistributed;
  payDistributedDate: string | null;
  commissionSplit: boolean;
  splitDetails: SplitParty[];
  referral: string | null;
  referralPct: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutSummary {
  totalDue: number;
  totalRevenue: number;
  totalRecords: number;
  paidCount: number;
  unpaidAmount: number;
  distributedCount: number;
  undistributedAmount: number;
}

export interface PriorMonth {
  month: number;
  year: number;
  amountDue: number;
  amountPaid: number;
}

export interface RebillAccount {
  type: "new" | "rebill";
  brandName: string;
  normalizedName: string;
  totalAmountDue: number;   // cents
  totalAmountPaid: number;  // cents
  salesRep: string | null;
  vertical: string | null;
  service: string | null;
  recordCount: number;
  priorMonths: PriorMonth[];
  /** true if sales_rep says REBILL but no prior history found — admin should verify */
  noPriorHistory?: boolean;
  /** true if amount_paid changed from the most recent prior month — admin should verify */
  amountChanged?: boolean;
  /** the most recent prior month's amount_paid for comparison (cents) */
  lastAmountPaid?: number;
}

export interface RebillMetrics {
  newAccounts: RebillAccount[];
  rebilledAccounts: RebillAccount[];
  newAccountCount: number;
  newAccountRevenue: number;    // cents
  rebillAccountCount: number;
  rebillAccountRevenue: number; // cents
}

export interface ForecastData {
  projectedNewAccounts: number;
  projectedNewRevenue: number;    // cents
  projectedRebillRevenue: number; // cents
  trailingMonths: number;
  limitedData: boolean;
  historicalData: Array<{
    month: number;
    year: number;
    newCount: number;
    newRevenue: number;
    rebillCount: number;
    rebillRevenue: number;
  }>;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function parseSplitDetails(raw: unknown): SplitParty[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p: unknown) => p && typeof p === "object" && "name" in (p as Record<string, unknown>) && "pct" in (p as Record<string, unknown>))
      .map((p: { name: string; pct: number }) => ({ name: String(p.name), pct: Number(p.pct) }));
  } catch {
    return [];
  }
}

function rowToPayout(row: Row): PayoutRecord {
  return {
    id: String(row.id),
    payoutMonth: Number(row.payout_month),
    payoutYear: Number(row.payout_year),
    dateJoined: row.date_joined != null ? String(row.date_joined) : null,
    firstDayAdSpend: row.first_day_ad_spend != null ? String(row.first_day_ad_spend) : null,
    brandName: String(row.brand_name),
    vertical: row.vertical != null ? String(row.vertical) : null,
    pointOfContact: row.point_of_contact != null ? String(row.point_of_contact) : null,
    service: row.service != null ? String(row.service) : null,
    isSigned: Number(row.is_signed) === 1,
    isPaid: Number(row.is_paid) === 1,
    addedToSlack: Number(row.added_to_slack) === 1,
    amountDue: Number(row.amount_due ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    paymentNotes: row.payment_notes != null ? String(row.payment_notes) : null,
    salesRep: row.sales_rep != null ? String(row.sales_rep) : null,
    payDistributed: (String(row.pay_distributed || "No") as PayDistributed),
    payDistributedDate: row.pay_distributed_date != null ? String(row.pay_distributed_date) : null,
    commissionSplit: Number(row.commission_split ?? 0) === 1,
    splitDetails: parseSplitDetails(row.split_details),
    referral: row.referral != null ? String(row.referral) : null,
    referralPct: row.referral_pct != null ? Number(row.referral_pct) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function readPayoutsByMonth(
  month: number,
  year: number
): Promise<PayoutRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM payouts WHERE payout_month = ? AND payout_year = ? ORDER BY created_at DESC",
    args: [month, year],
  });
  return result.rows.map(rowToPayout);
}

export async function findPayout(id: string): Promise<PayoutRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM payouts WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToPayout(result.rows[0]) : null;
}

export async function insertPayout(payout: PayoutRecord): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO payouts (id, payout_month, payout_year, date_joined, first_day_ad_spend, brand_name, vertical, point_of_contact, service, is_signed, is_paid, added_to_slack, amount_due, amount_paid, payment_notes, sales_rep, pay_distributed, pay_distributed_date, commission_split, split_details, referral, referral_pct, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      payout.id,
      payout.payoutMonth,
      payout.payoutYear,
      payout.dateJoined,
      payout.firstDayAdSpend,
      payout.brandName,
      payout.vertical,
      payout.pointOfContact,
      payout.service,
      payout.isSigned ? 1 : 0,
      payout.isPaid ? 1 : 0,
      payout.addedToSlack ? 1 : 0,
      payout.amountDue,
      payout.amountPaid,
      payout.paymentNotes,
      payout.salesRep,
      payout.payDistributed,
      payout.payDistributedDate,
      payout.commissionSplit ? 1 : 0,
      payout.splitDetails.length > 0 ? JSON.stringify(payout.splitDetails) : null,
      payout.referral,
      payout.referralPct,
      payout.createdAt,
      payout.updatedAt,
    ],
  });
}

export async function updatePayout(
  id: string,
  changes: Partial<Omit<PayoutRecord, "id">>
): Promise<void> {
  await ensureMigrated();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.payoutMonth !== undefined) {
    fields.push("payout_month = ?");
    args.push(changes.payoutMonth);
  }
  if (changes.payoutYear !== undefined) {
    fields.push("payout_year = ?");
    args.push(changes.payoutYear);
  }
  if (changes.dateJoined !== undefined) {
    fields.push("date_joined = ?");
    args.push(changes.dateJoined);
  }
  if (changes.firstDayAdSpend !== undefined) {
    fields.push("first_day_ad_spend = ?");
    args.push(changes.firstDayAdSpend);
  }
  if (changes.brandName !== undefined) {
    fields.push("brand_name = ?");
    args.push(changes.brandName);
  }
  if (changes.vertical !== undefined) {
    fields.push("vertical = ?");
    args.push(changes.vertical);
  }
  if (changes.pointOfContact !== undefined) {
    fields.push("point_of_contact = ?");
    args.push(changes.pointOfContact);
  }
  if (changes.service !== undefined) {
    fields.push("service = ?");
    args.push(changes.service);
  }
  if (changes.isSigned !== undefined) {
    fields.push("is_signed = ?");
    args.push(changes.isSigned ? 1 : 0);
  }
  if (changes.isPaid !== undefined) {
    fields.push("is_paid = ?");
    args.push(changes.isPaid ? 1 : 0);
  }
  if (changes.addedToSlack !== undefined) {
    fields.push("added_to_slack = ?");
    args.push(changes.addedToSlack ? 1 : 0);
  }
  if (changes.amountDue !== undefined) {
    fields.push("amount_due = ?");
    args.push(changes.amountDue);
  }
  if (changes.amountPaid !== undefined) {
    fields.push("amount_paid = ?");
    args.push(changes.amountPaid);
  }
  if (changes.paymentNotes !== undefined) {
    fields.push("payment_notes = ?");
    args.push(changes.paymentNotes);
  }
  if (changes.salesRep !== undefined) {
    fields.push("sales_rep = ?");
    args.push(changes.salesRep);
  }
  if (changes.payDistributed !== undefined) {
    fields.push("pay_distributed = ?");
    args.push(changes.payDistributed);
  }
  if (changes.payDistributedDate !== undefined) {
    fields.push("pay_distributed_date = ?");
    args.push(changes.payDistributedDate);
  }
  if (changes.commissionSplit !== undefined) {
    fields.push("commission_split = ?");
    args.push(changes.commissionSplit ? 1 : 0);
  }
  if (changes.splitDetails !== undefined) {
    fields.push("split_details = ?");
    args.push(changes.splitDetails.length > 0 ? JSON.stringify(changes.splitDetails) : null);
  }
  if (changes.referral !== undefined) {
    fields.push("referral = ?");
    args.push(changes.referral);
  }
  if (changes.referralPct !== undefined) {
    fields.push("referral_pct = ?");
    args.push(changes.referralPct);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  args.push(id);

  const db = getDb();
  await db.execute({
    sql: `UPDATE payouts SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function deletePayout(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM payouts WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Aggregates — brand-level
// ---------------------------------------------------------------------------

export interface BrandPayoutAggregate {
  normalizedBrandName: string;
  currentMonthAmountDue: number; // cents
  totalAmountPaid: number; // cents
}

export async function getPayoutAggregatesByBrand(
  currentMonth: number,
  currentYear: number
): Promise<BrandPayoutAggregate[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            LOWER(REPLACE(brand_name, ' ', '')) AS norm_brand,
            COALESCE(SUM(CASE WHEN payout_month = ? AND payout_year = ? THEN amount_due ELSE 0 END), 0) AS current_month_due,
            COALESCE(SUM(amount_paid), 0) AS total_paid
          FROM payouts
          GROUP BY LOWER(REPLACE(brand_name, ' ', ''))`,
    args: [currentMonth, currentYear],
  });
  return result.rows.map((row) => ({
    normalizedBrandName: String(row.norm_brand),
    currentMonthAmountDue: Number(row.current_month_due ?? 0),
    totalAmountPaid: Number(row.total_paid ?? 0),
  }));
}

export async function readPayoutsByNormalizedBrand(
  clientName: string,
  month: number,
  year: number
): Promise<PayoutRecord[]> {
  await ensureMigrated();
  const normName = clientName.toLowerCase().replace(/\s/g, "");
  if (!normName) return [];
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM payouts
          WHERE payout_month = ? AND payout_year = ?
          AND LOWER(REPLACE(brand_name, ' ', '')) LIKE ?
          ORDER BY amount_due DESC`,
    args: [month, year, `%${normName}%`],
  });
  return result.rows.map(rowToPayout);
}

// ---------------------------------------------------------------------------
// Sales Rep Options
// ---------------------------------------------------------------------------

export async function readSalesRepOptions(): Promise<string[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT name FROM sales_rep_options ORDER BY name");
  return result.rows.map((r) => String(r.name));
}

export async function addSalesRepOption(name: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO sales_rep_options (name) VALUES (?)",
    args: [name],
  });
}

export async function removeSalesRepOption(name: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM sales_rep_options WHERE name = ?",
    args: [name],
  });
}

// ---------------------------------------------------------------------------
// Vertical Options
// ---------------------------------------------------------------------------

export async function readVerticalOptions(): Promise<string[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT name FROM vertical_options ORDER BY name");
  return result.rows.map((r) => String(r.name));
}

export async function addVerticalOption(name: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO vertical_options (name) VALUES (?)",
    args: [name],
  });
}

export async function removeVerticalOption(name: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM vertical_options WHERE name = ?",
    args: [name],
  });
}

// ---------------------------------------------------------------------------
// Referral Options
// ---------------------------------------------------------------------------

export async function readReferralOptions(): Promise<string[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT name FROM referral_options ORDER BY name");
  return result.rows.map((r) => String(r.name));
}

export async function addReferralOption(name: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO referral_options (name) VALUES (?)",
    args: [name],
  });
}

export async function removeReferralOption(name: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM referral_options WHERE name = ?",
    args: [name],
  });
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export async function getPayoutSummary(
  month: number,
  year: number
): Promise<PayoutSummary> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            COALESCE(SUM(amount_due), 0) AS total_due,
            COALESCE(SUM(amount_paid), 0) AS total_revenue,
            COUNT(*) AS total_records,
            SUM(CASE WHEN is_paid = 1 THEN 1 ELSE 0 END) AS paid_count,
            COALESCE(SUM(amount_due) - SUM(amount_paid), 0) AS unpaid_amount,
            SUM(CASE WHEN pay_distributed = 'Yes' THEN 1 ELSE 0 END) AS distributed_count,
            COALESCE(SUM(CASE WHEN is_paid = 1 AND pay_distributed != 'Yes' THEN amount_paid ELSE 0 END), 0) AS undistributed_amount
          FROM payouts
          WHERE payout_month = ? AND payout_year = ?`,
    args: [month, year],
  });
  const row = result.rows[0];
  return {
    totalDue: Number(row?.total_due ?? 0),
    totalRevenue: Number(row?.total_revenue ?? 0),
    totalRecords: Number(row?.total_records ?? 0),
    paidCount: Number(row?.paid_count ?? 0),
    unpaidAmount: Number(row?.unpaid_amount ?? 0),
    distributedCount: Number(row?.distributed_count ?? 0),
    undistributedAmount: Number(row?.undistributed_amount ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Brand name normalization
// ---------------------------------------------------------------------------

const BUSINESS_SUFFIXES = /\b(llc|inc|incorporated|ltd|limited|corp|corporation|co|company|group|enterprises|holdings|solutions|services|agency|consulting)\b/g;
const LEADING_THE = /^the\b/;

export function normalizeBrandName(name: string): string {
  let s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/['\u2019]s\b/g, "")    // strip possessives
    .replace(/[^a-z0-9\s]/g, "")     // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(LEADING_THE, "").trim();
  s = s.replace(BUSINESS_SUFFIXES, "").trim();
  return s.replace(/\s/g, "");       // compact key
}

// ---------------------------------------------------------------------------
// Brand matching
// ---------------------------------------------------------------------------

const MIN_MATCH_LEN = 4;

/**
 * Check whether two already-normalised brand names refer to the same client.
 * Uses substring-includes with a 4-char minimum to prevent false positives.
 */
export function brandsMatch(normA: string, normB: string): boolean {
  const shorter = normA.length <= normB.length ? normA : normB;
  if (shorter.length < MIN_MATCH_LEN) {
    return normA === normB;
  }
  return normA.includes(normB) || normB.includes(normA);
}

// ---------------------------------------------------------------------------
// Rebill detection
// ---------------------------------------------------------------------------

interface HistoricalEntry {
  month: number;
  year: number;
  amountDue: number;
  amountPaid: number;
}

function buildHistoricalMap(
  rows: Row[]
): Map<string, HistoricalEntry[]> {
  const map = new Map<string, HistoricalEntry[]>();
  for (const row of rows) {
    const norm = normalizeBrandName(String(row.brand_name));
    if (!norm) continue;
    const entry: HistoricalEntry = {
      month: Number(row.payout_month),
      year: Number(row.payout_year),
      amountDue: Number(row.amount_due ?? 0),
      amountPaid: Number(row.amount_paid ?? 0),
    };
    const arr = map.get(norm);
    if (arr) arr.push(entry);
    else map.set(norm, [entry]);
  }
  return map;
}

function isRebillSalesRep(salesRep: string | null): boolean {
  if (!salesRep) return false;
  return salesRep.toLowerCase().includes("rebill");
}

function deduplicatePriorMonths(entries: HistoricalEntry[]): PriorMonth[] {
  const monthMap = new Map<string, PriorMonth>();
  for (const e of entries) {
    const key = `${e.year}-${e.month}`;
    const existing = monthMap.get(key);
    if (existing) {
      existing.amountDue += e.amountDue;
      existing.amountPaid += e.amountPaid;
    } else {
      monthMap.set(key, { ...e });
    }
  }
  return Array.from(monthMap.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
}

function classifyMonth(
  currentRecords: PayoutRecord[],
  historicalMap: Map<string, HistoricalEntry[]>
): RebillMetrics {
  // Group current month records by normalized brand
  const brandGroups = new Map<
    string,
    { records: PayoutRecord[]; norm: string }
  >();
  for (const rec of currentRecords) {
    const norm = normalizeBrandName(rec.brandName);
    if (!norm) continue;
    const group = brandGroups.get(norm);
    if (group) group.records.push(rec);
    else brandGroups.set(norm, { records: [rec], norm });
  }

  const newAccounts: RebillAccount[] = [];
  const rebilledAccounts: RebillAccount[] = [];

  for (const [norm, { records }] of brandGroups) {
    const totalDue = records.reduce((s, r) => s + r.amountDue, 0);
    const totalPaid = records.reduce((s, r) => s + r.amountPaid, 0);
    const first = records[0];

    // An account is a rebill candidate if ANY record for this brand
    // in the current month has a sales_rep containing "REBILL"
    const hasRebillFlag = records.some((r) => isRebillSalesRep(r.salesRep));

    if (!hasRebillFlag) {
      // Not flagged as rebill → it's a new account for this month
      newAccounts.push({
        type: "new",
        brandName: first.brandName,
        normalizedName: norm,
        totalAmountDue: totalDue,
        totalAmountPaid: totalPaid,
        salesRep: first.salesRep,
        vertical: first.vertical,
        service: first.service,
        recordCount: records.length,
        priorMonths: [],
      });
      continue;
    }

    // Has REBILL flag — search all prior months for a brand name that
    // includes or is included by this normalized name. This handles
    // inconsistent entries like "Inner Glow" vs "Inner Glow Services".
    const priorEntries: HistoricalEntry[] = [];
    for (const [histNorm, entries] of historicalMap) {
      if (brandsMatch(norm, histNorm)) {
        priorEntries.push(...entries);
      }
    }
    const priorMonths = priorEntries.length > 0
      ? deduplicatePriorMonths(priorEntries)
      : [];

    const hasPriorHistory = priorMonths.length > 0;

    // Amount change detection: compare current amount_paid with the most
    // recent prior month's amount_paid as a secondary verification signal
    let amountChanged = false;
    let lastAmountPaid: number | undefined;
    if (hasPriorHistory) {
      const mostRecent = priorMonths[priorMonths.length - 1];
      lastAmountPaid = mostRecent.amountPaid;
      if (totalPaid !== mostRecent.amountPaid) {
        amountChanged = true;
      }
    }

    rebilledAccounts.push({
      type: "rebill",
      brandName: first.brandName,
      normalizedName: norm,
      totalAmountDue: totalDue,
      totalAmountPaid: totalPaid,
      salesRep: first.salesRep,
      vertical: first.vertical,
      service: first.service,
      recordCount: records.length,
      priorMonths,
      // Warnings for admin
      noPriorHistory: !hasPriorHistory,
      amountChanged,
      lastAmountPaid,
    });
  }

  return {
    newAccounts,
    rebilledAccounts,
    newAccountCount: newAccounts.length,
    newAccountRevenue: newAccounts.reduce((s, a) => s + a.totalAmountDue, 0),
    rebillAccountCount: rebilledAccounts.length,
    rebillAccountRevenue: rebilledAccounts.reduce(
      (s, a) => s + a.totalAmountDue,
      0
    ),
  };
}

export async function getRebillMetrics(
  month: number,
  year: number
): Promise<RebillMetrics> {
  await ensureMigrated();
  const db = getDb();

  // Fetch current month records AND all other records in parallel
  const [currentResult, histResult] = await Promise.all([
    db.execute({
      sql: "SELECT * FROM payouts WHERE payout_month = ? AND payout_year = ?",
      args: [month, year],
    }),
    db.execute({
      sql: `SELECT brand_name, payout_month, payout_year, amount_due, amount_paid
            FROM payouts
            WHERE payout_year < ? OR (payout_year = ? AND payout_month < ?)`,
      args: [year, year, month],
    }),
  ]);

  const currentRecords = currentResult.rows.map(rowToPayout);
  const historicalMap = buildHistoricalMap(histResult.rows);

  return classifyMonth(currentRecords, historicalMap);
}

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

function getPriorMonths(
  month: number,
  year: number,
  count: number
): Array<{ month: number; year: number }> {
  const result: Array<{ month: number; year: number }> = [];
  let m = month;
  let y = year;
  for (let i = 0; i < count; i++) {
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
    result.push({ month: m, year: y });
  }
  return result;
}

export async function getPayoutForecast(
  month: number,
  year: number
): Promise<ForecastData> {
  await ensureMigrated();
  const db = getDb();

  const trailing = getPriorMonths(month, year, 6);

  // The month before the selected one (handles Jan → Dec of prior year)
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }

  // Fetch ALL records up to and including the trailing period in one query
  const allResult = await db.execute({
    sql: `SELECT * FROM payouts
          WHERE payout_year < ? OR (payout_year = ? AND payout_month <= ?)`,
    args: [prevYear, prevYear, prevMonth],
  });

  // Group all records by month
  const allRows = allResult.rows;
  const byMonth = new Map<string, Row[]>();
  for (const row of allRows) {
    const key = `${row.payout_year}-${row.payout_month}`;
    const arr = byMonth.get(key);
    if (arr) arr.push(row);
    else byMonth.set(key, [row]);
  }

  // For each trailing month, compute rebill metrics
  const historicalData: ForecastData["historicalData"] = [];
  for (const t of trailing) {
    const key = `${t.year}-${t.month}`;
    const monthRows = byMonth.get(key);
    if (!monthRows || monthRows.length === 0) continue;

    // Build historical map for everything BEFORE this trailing month
    const histRows = allRows.filter((r) => {
      const ry = Number(r.payout_year);
      const rm = Number(r.payout_month);
      return ry < t.year || (ry === t.year && rm < t.month);
    });
    const histMap = buildHistoricalMap(histRows);
    const monthRecords = monthRows.map(rowToPayout);
    const metrics = classifyMonth(monthRecords, histMap);

    historicalData.push({
      month: t.month,
      year: t.year,
      newCount: metrics.newAccountCount,
      newRevenue: metrics.newAccountRevenue,
      rebillCount: metrics.rebillAccountCount,
      rebillRevenue: metrics.rebillAccountRevenue,
    });
  }

  // Weighted moving average (most recent = highest weight)
  const n = historicalData.length;
  if (n === 0) {
    return {
      projectedNewAccounts: 0,
      projectedNewRevenue: 0,
      projectedRebillRevenue: 0,
      trailingMonths: 0,
      limitedData: true,
      historicalData: [],
    };
  }

  // historicalData[0] is the most recent trailing month
  let weightSum = 0;
  let wNewAccounts = 0;
  let wNewRevenue = 0;
  let wRebillRevenue = 0;
  for (let i = 0; i < n; i++) {
    const weight = n - i; // most recent gets highest weight
    const d = historicalData[i];
    wNewAccounts += d.newCount * weight;
    wNewRevenue += d.newRevenue * weight;
    wRebillRevenue += d.rebillRevenue * weight;
    weightSum += weight;
  }

  return {
    projectedNewAccounts: Math.round(wNewAccounts / weightSum),
    projectedNewRevenue: Math.round(wNewRevenue / weightSum),
    projectedRebillRevenue: Math.round(wRebillRevenue / weightSum),
    trailingMonths: n,
    limitedData: n < 3,
    historicalData,
  };
}
