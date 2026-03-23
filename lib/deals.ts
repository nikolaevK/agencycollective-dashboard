import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export type DealStatus = "closed" | "not_closed" | "pending_signature" | "in_progress";

export interface DealRecord {
  id: string;
  closerId: string;
  clientName: string;
  clientUserId: string | null;
  dealValue: number; // cents
  serviceCategory: string | null;
  closingDate: string | null;
  status: DealStatus;
  notes: string | null;
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function rowToDeal(row: Row): DealRecord {
  return {
    id: String(row.id),
    closerId: String(row.closer_id),
    clientName: String(row.client_name),
    clientUserId: row.client_user_id != null ? String(row.client_user_id) : null,
    dealValue: Number(row.deal_value ?? 0),
    serviceCategory: row.service_category != null ? String(row.service_category) : null,
    closingDate: row.closing_date != null ? String(row.closing_date) : null,
    status: (String(row.status || "in_progress") as DealStatus),
    notes: row.notes != null ? String(row.notes) : null,
    googleEventId: row.google_event_id != null ? String(row.google_event_id) : null,
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
    sql: `INSERT INTO deals (id, closer_id, client_name, client_user_id, deal_value, service_category, closing_date, status, notes, google_event_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      deal.id,
      deal.closerId,
      deal.clientName,
      deal.clientUserId,
      deal.dealValue,
      deal.serviceCategory,
      deal.closingDate,
      deal.status,
      deal.notes,
      deal.googleEventId,
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
}

export async function getCloserDealStats(closerId: string): Promise<CloserDealStats> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            COALESCE(SUM(CASE WHEN status = 'closed' THEN deal_value ELSE 0 END), 0) AS total_revenue,
            COUNT(*) AS deal_count,
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count,
            COALESCE(AVG(CASE WHEN status = 'closed' THEN deal_value ELSE NULL END), 0) AS avg_deal_value
          FROM deals WHERE closer_id = ?`,
    args: [closerId],
  });
  const row = result.rows[0];
  return {
    totalRevenue: Number(row?.total_revenue ?? 0),
    dealCount: Number(row?.deal_count ?? 0),
    closedCount: Number(row?.closed_count ?? 0),
    avgDealValue: Number(row?.avg_deal_value ?? 0),
  };
}

export interface TeamStats {
  totalRevenue: number;
  totalDeals: number;
  closedDeals: number;
  closerBreakdowns: Array<{
    closerId: string;
    displayName: string;
    avatarPath: string | null;
    revenue: number;
    closedCount: number;
    totalCount: number;
    commissionRate: number;
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
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_deals
     FROM deals`
  );
  const t = totals.rows[0];

  // Per-closer breakdowns
  const breakdowns = await db.execute(
    `SELECT
       c.id AS closer_id,
       c.display_name,
       c.avatar_path,
       c.commission_rate,
       COALESCE(SUM(CASE WHEN d.status = 'closed' THEN d.deal_value ELSE 0 END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN d.status = 'closed' THEN 1 ELSE 0 END), 0) AS closed_count,
       COUNT(d.id) AS total_count
     FROM closers c
     LEFT JOIN deals d ON d.closer_id = c.id
     WHERE c.status = 'active'
     GROUP BY c.id
     ORDER BY revenue DESC`
  );

  return {
    totalRevenue: Number(t?.total_revenue ?? 0),
    totalDeals: Number(t?.total_deals ?? 0),
    closedDeals: Number(t?.closed_deals ?? 0),
    closerBreakdowns: breakdowns.rows.map((row) => ({
      closerId: String(row.closer_id),
      displayName: String(row.display_name),
      avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
      revenue: Number(row.revenue ?? 0),
      closedCount: Number(row.closed_count ?? 0),
      totalCount: Number(row.total_count ?? 0),
      commissionRate: Number(row.commission_rate ?? 0),
    })),
  };
}
