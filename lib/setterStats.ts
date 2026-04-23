import { getDb, ensureMigrated } from "./db";
import { getDealInvoiceStatuses } from "./dealInvoices";
import { getDealContractStatuses } from "./dealContracts";

export interface SetterStats {
  appointmentsSet: number;
  showCount: number;
  noShowCount: number;
  showRate: number;
  dealsLinked: number;
  dealsClosed: number;
  revenueAttributed: number; // cents
  commissionEarned: number; // cents; paid deals only
  pendingDeals: number;
  followUpCount: number;
}

export interface SetterRecentDeal {
  id: string;
  clientName: string;
  dealValue: number;
  status: string;
  paidStatus: string;
  closingDate: string | null;
  createdAt: string;
  closerName: string | null;
  invoiceStatus: string | null;
  invoiceNumber: string | null;
  contractStatus: string | null;
}

export interface SetterFollowUp {
  appointmentId: string;
  googleEventId: string;
  clientName: string | null;
  clientEmail: string | null;
  scheduledAt: string | null;
  postCallStatus: string;
  notes: string | null;
  updatedAt: string;
}

/**
 * Compute a setter's dashboard stats. All counts/sums derive from existing
 * tables (appointments, deals, event_attendance) — nothing is persisted.
 *
 * Show rate is intersected with the setter's claimed events: only show/no-show
 * records on events this setter actually owns an appointment for are counted.
 * Otherwise a setter's show rate would include every closer's attendance.
 *
 * Commission uses the setter's own commission_rate (basis points) applied to
 * the deal value for any deal credited to them that is both closed AND paid.
 */
export async function getSetterStats(
  setterId: string,
  commissionRateBasisPoints: number
): Promise<SetterStats> {
  await ensureMigrated();
  const db = getDb();

  const apptCount = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM appointments WHERE setter_id = ?",
    args: [setterId],
  });

  // Count each event at most once, using the *latest* attendance mark. If two
  // closers disagree on the same event, the most recent one wins — matches
  // the latest-wins rule we use everywhere else (setter attribution, team
  // attendance index). A plain DISTINCT would have double-counted events
  // where closers disagreed.
  const attendance = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
            SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
          FROM (
            SELECT ea.google_event_id, ea.show_status,
                   ROW_NUMBER() OVER (
                     PARTITION BY ea.google_event_id
                     ORDER BY ea.updated_at DESC
                   ) AS rn
              FROM event_attendance ea
             WHERE ea.google_event_id IN (
               SELECT DISTINCT google_event_id FROM appointments WHERE setter_id = ?
             )
          ) WHERE rn = 1`,
    args: [setterId],
  });

  // "Pending" = anything not yet resolved: awaiting signature, on hold, or
  // rescheduled. Explicitly excludes closed and not_closed (both terminal).
  const dealAggregates = await db.execute({
    sql: `SELECT
            COUNT(*) AS deals_linked,
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS deals_closed,
            SUM(CASE WHEN status = 'closed' THEN deal_value ELSE 0 END) AS revenue_attributed,
            SUM(CASE WHEN status = 'closed' AND paid_status = 'paid' THEN deal_value ELSE 0 END) AS paid_revenue,
            SUM(CASE WHEN status IN ('pending_signature', 'follow_up', 'rescheduled') THEN 1 ELSE 0 END) AS pending_deals
          FROM deals
          WHERE setter_id = ?`,
    args: [setterId],
  });

  const followUps = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM appointments
          WHERE setter_id = ? AND post_call_status = 'needs_followup'`,
    args: [setterId],
  });

  const a = attendance.rows[0];
  const d = dealAggregates.rows[0];
  const showCount = Number(a?.show_count ?? 0);
  const noShowCount = Number(a?.no_show_count ?? 0);
  const tracked = showCount + noShowCount;
  const paidRevenue = Number(d?.paid_revenue ?? 0);

  return {
    appointmentsSet: Number(apptCount.rows[0]?.c ?? 0),
    showCount,
    noShowCount,
    showRate: tracked > 0 ? Math.round((showCount / tracked) * 1000) / 10 : 0,
    dealsLinked: Number(d?.deals_linked ?? 0),
    dealsClosed: Number(d?.deals_closed ?? 0),
    revenueAttributed: Number(d?.revenue_attributed ?? 0),
    commissionEarned: Math.round((paidRevenue * commissionRateBasisPoints) / 10000),
    pendingDeals: Number(d?.pending_deals ?? 0),
    followUpCount: Number(followUps.rows[0]?.c ?? 0),
  };
}

export async function getSetterRecentDeals(
  setterId: string,
  // Bumped from 10 → 50 so older pending_signature / follow_up deals don't
  // drop off the dashboard when a setter racks up recent closed deals. The
  // closer dashboard doesn't limit at all; 50 keeps the payload bounded
  // without defeating the "see your pending deals" intent.
  limit: number = 50
): Promise<SetterRecentDeal[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT d.id, d.client_name, d.deal_value, d.status, d.paid_status,
                 d.closing_date, d.created_at, c.display_name AS closer_name
          FROM deals d
          LEFT JOIN closers c ON c.id = d.closer_id
          WHERE d.setter_id = ?
          ORDER BY d.created_at DESC
          LIMIT ?`,
    args: [setterId, limit],
  });

  const base = result.rows.map((row) => ({
    id: String(row.id),
    clientName: String(row.client_name),
    dealValue: Number(row.deal_value ?? 0),
    status: String(row.status),
    paidStatus: String(row.paid_status ?? "unpaid"),
    closingDate: row.closing_date != null ? String(row.closing_date) : null,
    createdAt: String(row.created_at),
    closerName: row.closer_name != null ? String(row.closer_name) : null,
  }));

  // Surface the same invoice/contract status the closer sees — a setter
  // credited on a closed deal should know whether the invoice went out and
  // the contract got signed, without pinging the closer.
  const dealIds = base.map((d) => d.id);
  const [invoiceStatuses, contractStatuses] = await Promise.all([
    getDealInvoiceStatuses(dealIds),
    getDealContractStatuses(dealIds),
  ]);

  return base.map((d) => ({
    ...d,
    invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
    invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
    contractStatus: contractStatuses[d.id]?.status ?? null,
  }));
}

export async function getSetterFollowUps(
  setterId: string,
  limit: number = 20
): Promise<SetterFollowUp[]> {
  await ensureMigrated();
  const db = getDb();
  // Oldest pending follow-up first, so stale follow-ups surface before fresh
  // ones and don't get buried. Rows without a scheduled time fall to the end
  // and sort by when the setter last touched them.
  const result = await db.execute({
    sql: `SELECT id, google_event_id, client_name, client_email, scheduled_at,
                 post_call_status, notes, updated_at
          FROM appointments
          WHERE setter_id = ? AND post_call_status = 'needs_followup'
          ORDER BY scheduled_at ASC NULLS LAST, updated_at ASC
          LIMIT ?`,
    args: [setterId, limit],
  });
  return result.rows.map((row) => ({
    appointmentId: String(row.id),
    googleEventId: String(row.google_event_id),
    clientName: row.client_name != null ? String(row.client_name) : null,
    clientEmail: row.client_email != null ? String(row.client_email) : null,
    scheduledAt: row.scheduled_at != null ? String(row.scheduled_at) : null,
    postCallStatus: String(row.post_call_status),
    notes: row.notes != null ? String(row.notes) : null,
    updatedAt: String(row.updated_at),
  }));
}
