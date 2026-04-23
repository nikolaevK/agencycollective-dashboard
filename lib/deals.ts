import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export type DealStatus = "closed" | "not_closed" | "pending_signature" | "rescheduled" | "follow_up";

export type ShowStatus = "showed" | "no_show" | null;

export interface DealRecord {
  id: string;
  closerId: string;
  setterId: string | null;
  clientName: string;
  clientUserId: string | null;
  clientEmail: string | null;
  dealValue: number; // cents
  serviceCategory: string | null;
  industry: string | null;
  closingDate: string | null;
  status: DealStatus;
  showStatus: ShowStatus;
  notes: string | null;
  googleEventId: string | null;
  paymentType: string;
  brandName: string | null;
  website: string | null;
  paidStatus: "paid" | "unpaid";
  additionalCcEmails: string[];
  createdAt: string;
  updatedAt: string;
}

function parseCcEmails(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

const CC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CC_EMAILS = 10;

export function sanitizeCcEmails(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === "string" && input.length > 0
      ? (() => { try { const p = JSON.parse(input); return Array.isArray(p) ? p : [input]; } catch { return [input]; } })()
      : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim().toLowerCase();
    if (!trimmed || trimmed.length > 254) continue;
    if (!CC_EMAIL_REGEX.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= MAX_CC_EMAILS) break;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function rowToDeal(row: Row): DealRecord {
  return {
    id: String(row.id),
    closerId: String(row.closer_id),
    setterId: row.setter_id != null ? String(row.setter_id) : null,
    clientName: String(row.client_name),
    clientUserId: row.client_user_id != null ? String(row.client_user_id) : null,
    clientEmail: row.client_email != null ? String(row.client_email) : null,
    dealValue: Number(row.deal_value ?? 0),
    serviceCategory: row.service_category != null ? String(row.service_category) : null,
    industry: row.industry != null ? String(row.industry) : null,
    closingDate: row.closing_date != null ? String(row.closing_date) : null,
    status: (String(row.status || "follow_up") as DealStatus),
    showStatus: row.show_status != null ? (String(row.show_status) as "showed" | "no_show") : null,
    notes: row.notes != null ? String(row.notes) : null,
    googleEventId: row.google_event_id != null ? String(row.google_event_id) : null,
    paymentType: String(row.payment_type ?? "local"),
    brandName: row.brand_name != null ? String(row.brand_name) : null,
    website: row.website != null ? String(row.website) : null,
    paidStatus: (String(row.paid_status ?? "unpaid")) as "paid" | "unpaid",
    additionalCcEmails: parseCcEmails(row.additional_cc_emails),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function readDeals(): Promise<DealRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM deals ORDER BY created_at DESC"
  );
  return result.rows.map(rowToDeal);
}

export async function readDealsByCloser(closerId: string): Promise<DealRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM deals WHERE closer_id = ? ORDER BY created_at DESC",
    args: [closerId],
  });
  return result.rows.map(rowToDeal);
}

export async function findDeal(id: string): Promise<DealRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM deals WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToDeal(result.rows[0]) : null;
}

export async function insertDeal(deal: DealRecord): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO deals (id, closer_id, setter_id, client_name, client_user_id, client_email, deal_value, service_category, industry, closing_date, status, show_status, notes, google_event_id, payment_type, brand_name, website, paid_status, additional_cc_emails)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      deal.id,
      deal.closerId,
      deal.setterId,
      deal.clientName,
      deal.clientUserId,
      deal.clientEmail,
      deal.dealValue,
      deal.serviceCategory,
      deal.industry,
      deal.closingDate,
      deal.status,
      deal.showStatus,
      deal.notes,
      deal.googleEventId,
      deal.paymentType ?? "local",
      deal.brandName,
      deal.website,
      deal.paidStatus ?? "unpaid",
      deal.additionalCcEmails && deal.additionalCcEmails.length > 0 ? JSON.stringify(deal.additionalCcEmails) : null,
    ],
  });
}

export async function updateDeal(
  id: string,
  changes: Partial<Omit<DealRecord, "id">>
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.clientName !== undefined) {
    fields.push("client_name = ?");
    args.push(changes.clientName);
  }
  if (changes.clientUserId !== undefined) {
    fields.push("client_user_id = ?");
    args.push(changes.clientUserId);
  }
  if (changes.dealValue !== undefined) {
    fields.push("deal_value = ?");
    args.push(changes.dealValue);
  }
  if (changes.serviceCategory !== undefined) {
    fields.push("service_category = ?");
    args.push(changes.serviceCategory);
  }
  if (changes.industry !== undefined) {
    fields.push("industry = ?");
    args.push(changes.industry);
  }
  if (changes.showStatus !== undefined) {
    fields.push("show_status = ?");
    args.push(changes.showStatus);
  }
  if (changes.closingDate !== undefined) {
    fields.push("closing_date = ?");
    args.push(changes.closingDate);
  }
  if (changes.status !== undefined) {
    fields.push("status = ?");
    args.push(changes.status);
  }
  if (changes.notes !== undefined) {
    fields.push("notes = ?");
    args.push(changes.notes);
  }
  if (changes.googleEventId !== undefined) {
    fields.push("google_event_id = ?");
    args.push(changes.googleEventId);
  }
  if (changes.clientEmail !== undefined) {
    fields.push("client_email = ?");
    args.push(changes.clientEmail);
  }
  if (changes.paymentType !== undefined) {
    fields.push("payment_type = ?");
    args.push(changes.paymentType);
  }
  if (changes.brandName !== undefined) {
    fields.push("brand_name = ?");
    args.push(changes.brandName);
  }
  if (changes.website !== undefined) {
    fields.push("website = ?");
    args.push(changes.website);
  }
  if (changes.paidStatus !== undefined) {
    fields.push("paid_status = ?");
    args.push(changes.paidStatus);
  }
  if (changes.additionalCcEmails !== undefined) {
    fields.push("additional_cc_emails = ?");
    args.push(changes.additionalCcEmails.length > 0 ? JSON.stringify(changes.additionalCcEmails) : null);
  }
  if (changes.setterId !== undefined) {
    fields.push("setter_id = ?");
    args.push(changes.setterId);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `UPDATE deals SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function deleteDeal(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  // Delete linked invoices and contract first
  await db.execute({ sql: "DELETE FROM deal_invoices WHERE deal_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM deal_additional_invoices WHERE deal_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM deal_contracts WHERE deal_id = ?", args: [id] });
  const result = await db.execute({
    sql: "DELETE FROM deals WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

export interface CloserDealStats {
  totalRevenue: number;
  dealCount: number;
  closedCount: number;
  avgDealValue: number;
  showCount: number;
  noShowCount: number;
  showRate: number; // percentage
}

export async function getCloserDealStats(closerId: string): Promise<CloserDealStats> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            COALESCE(SUM(CASE WHEN status = 'closed' THEN deal_value ELSE 0 END), 0) AS total_revenue,
            COUNT(*) AS deal_count,
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count,
            COALESCE(AVG(CASE WHEN status = 'closed' THEN deal_value ELSE NULL END), 0) AS avg_deal_value,
            SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
            SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
          FROM deals WHERE closer_id = ?`,
    args: [closerId],
  });
  const row = result.rows[0];
  const showCount = Number(row?.show_count ?? 0);
  const noShowCount = Number(row?.no_show_count ?? 0);
  const totalTracked = showCount + noShowCount;
  return {
    totalRevenue: Number(row?.total_revenue ?? 0),
    dealCount: Number(row?.deal_count ?? 0),
    closedCount: Number(row?.closed_count ?? 0),
    avgDealValue: Number(row?.avg_deal_value ?? 0),
    showCount,
    noShowCount,
    showRate: totalTracked > 0 ? Math.round((showCount / totalTracked) * 1000) / 10 : 0,
  };
}

export interface TeamStats {
  totalRevenue: number;
  totalDeals: number;
  closedDeals: number;
  showCount: number;
  noShowCount: number;
  showRate: number;
  closerBreakdowns: Array<{
    closerId: string;
    displayName: string;
    avatarPath: string | null;
    revenue: number;
    closedCount: number;
    totalCount: number;
    commissionRate: number;
    showCount: number;
    noShowCount: number;
    showRate: number;
  }>;
}

export async function getTeamStats(): Promise<TeamStats> {
  await ensureMigrated();
  const db = getDb();

  // Overall totals
  const totals = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'closed' THEN deal_value ELSE 0 END), 0) AS total_revenue,
       COUNT(*) AS total_deals,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_deals,
       SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
       SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
     FROM deals`
  );
  const t = totals.rows[0];
  const teamShowCount = Number(t?.show_count ?? 0);
  const teamNoShowCount = Number(t?.no_show_count ?? 0);
  const teamTracked = teamShowCount + teamNoShowCount;

  // Per-closer breakdowns
  const breakdowns = await db.execute(
    `SELECT
       c.id AS closer_id,
       c.display_name,
       c.avatar_path,
       c.commission_rate,
       COALESCE(SUM(CASE WHEN d.status = 'closed' THEN d.deal_value ELSE 0 END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN d.status = 'closed' THEN 1 ELSE 0 END), 0) AS closed_count,
       COUNT(d.id) AS total_count,
       COALESCE(SUM(CASE WHEN d.show_status = 'showed' THEN 1 ELSE 0 END), 0) AS show_count,
       COALESCE(SUM(CASE WHEN d.show_status = 'no_show' THEN 1 ELSE 0 END), 0) AS no_show_count
     FROM closers c
     LEFT JOIN deals d ON d.closer_id = c.id
     WHERE c.status = 'active' AND c.role != 'setter'
     GROUP BY c.id
     ORDER BY revenue DESC`
  );

  return {
    totalRevenue: Number(t?.total_revenue ?? 0),
    totalDeals: Number(t?.total_deals ?? 0),
    closedDeals: Number(t?.closed_deals ?? 0),
    showCount: teamShowCount,
    noShowCount: teamNoShowCount,
    showRate: teamTracked > 0 ? Math.round((teamShowCount / teamTracked) * 1000) / 10 : 0,
    closerBreakdowns: breakdowns.rows.map((row) => {
      const sc = Number(row.show_count ?? 0);
      const nsc = Number(row.no_show_count ?? 0);
      const tracked = sc + nsc;
      return {
        closerId: String(row.closer_id),
        displayName: String(row.display_name),
        avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
        revenue: Number(row.revenue ?? 0),
        closedCount: Number(row.closed_count ?? 0),
        totalCount: Number(row.total_count ?? 0),
        commissionRate: Number(row.commission_rate ?? 0),
        showCount: sc,
        noShowCount: nsc,
        showRate: tracked > 0 ? Math.round((sc / tracked) * 1000) / 10 : 0,
      };
    }),
  };
}
