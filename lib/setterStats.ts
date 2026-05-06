import { getDb, ensureMigrated } from "./db";
import { getDealInvoiceStatuses } from "./dealInvoices";
import { getDealContractStatuses } from "./dealContracts";
import type { SetterTier } from "./appointments";

// 1099 contract commission rates (basis points). Tiers A and B are
// percentages of collected revenue. Tier C is a flat per-attended-call
// fee. Tier D is no commission.
const TIER_A_BPS = 300;        // 3.00%
const TIER_B_BPS = 200;        // 2.00%
const TIER_C_FEE_CENTS = 2500; // $25 flat per attended call
// No-retainer cap: $500 per deal (Section 3.8). Applies per deal to
// whatever tier (A or B) attribution applies; tier C is per-call so the
// cap is irrelevant there.
const NO_RETAINER_CAP_CENTS = 50000;

export interface SetterTierBreakdown {
  /** Closed + paid Tier A deals attributed to the setter. */
  tierA: { dealCount: number; paidRevenue: number; commission: number };
  /** Closed + paid Tier B deals attributed to the setter. */
  tierB: { dealCount: number; paidRevenue: number; commission: number };
  /** Per-attended-call fees on Tier C. `attendedCount` reflects the number
   *  of distinct events where the setter has tier=C and a closer marked
   *  show_status=showed. */
  tierC: { attendedCount: number; commission: number };
  /** Tier D deal count for visibility. Always pays $0. */
  tierD: { dealCount: number };
}

export interface SetterMetricBucket {
  appointmentsSet: number;
  showCount: number;
  noShowCount: number;
  showRate: number;
  dealsLinked: number;
  dealsClosed: number;
  revenueAttributed: number; // cents — closed deal value attributed to setter
  paidRevenueAttributed: number; // cents — closed AND paid
  outstandingRevenueAttributed: number; // cents — closed AND unpaid
  commissionEarned: number; // cents; sum across tiers, A/B capped per-deal under no_retainer
  commissionPending: number; // cents; closed-unpaid A/B (would-pay if collected, capped)
  pendingDeals: number;
  /** Per-tier breakdown — UI surfaces this so the setter sees which tier
   *  earned which dollars. Sum of A+B+C commissions = commissionEarned. */
  tierBreakdown: SetterTierBreakdown;
}

export interface SetterStats {
  /** Lifetime totals across the setter's whole tenure. */
  lifetime: SetterMetricBucket;
  /** Time-frame-scoped bucket. Equals lifetime when no since/until passed. */
  window: SetterMetricBucket;
  /** Always lifetime — needs_followup queue length doesn't bucket by date. */
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
  setterTier: SetterTier | null;
  noRetainer: boolean;
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
 * Compute a setter's dashboard stats with 1099-contract tier-aware
 * commission math.
 *
 *   Tier A: paid revenue × 3%, capped at $500 per deal when no_retainer=1
 *   Tier B: paid revenue × 2%, same per-deal cap
 *   Tier C: $25 × distinct attended (showed) events with tier=C on appointment
 *   Tier D: $0 (counted but pays nothing)
 *
 * Show rate is intersected with the setter's claimed events so a setter's
 * rate reflects only the events they actually owned an appointment for.
 */
export async function getSetterStats(
  setterId: string,
  opts: { since?: string; until?: string } = {}
): Promise<SetterStats> {
  await ensureMigrated();
  const db = getDb();

  const lifetime = await aggregateSetterBucket(db, setterId, {});
  const window =
    opts.since && opts.until
      ? await aggregateSetterBucket(db, setterId, opts)
      : lifetime;

  const followUps = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM appointments
          WHERE setter_id = ? AND post_call_status = 'needs_followup'`,
    args: [setterId],
  });

  return {
    lifetime,
    window,
    followUpCount: Number(followUps.rows[0]?.c ?? 0),
  };
}

async function aggregateSetterBucket(
  db: ReturnType<typeof getDb>,
  setterId: string,
  bounds: { since?: string; until?: string }
): Promise<SetterMetricBucket> {
  // Appointments are bucketed by scheduled_at when present, falling back to
  // created_at. Same fallback the deals helper uses for closing_date.
  const apptDateConditions: string[] = [];
  const apptValues: (string | number)[] = [setterId];
  if (bounds.since) {
    apptDateConditions.push("AND COALESCE(substr(scheduled_at,1,10), substr(created_at,1,10)) >= ?");
    apptValues.push(bounds.since);
  }
  if (bounds.until) {
    apptDateConditions.push("AND COALESCE(substr(scheduled_at,1,10), substr(created_at,1,10)) <= ?");
    apptValues.push(bounds.until);
  }
  const apptDateClause = apptDateConditions.join(" ");

  const apptCount = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM appointments WHERE setter_id = ? ${apptDateClause}`,
    args: apptValues,
  });

  // Attendance restricted to events the setter actually claimed in-window.
  // Latest-mark-wins per event — same rule as the rest of the project.
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
               SELECT DISTINCT google_event_id
                 FROM appointments
                WHERE setter_id = ? ${apptDateClause}
             )
          ) WHERE rn = 1`,
    args: apptValues,
  });

  // Deals are bucketed by closing_date with created_at fallback — matches
  // the closer-side helper so all surfaces agree on which deal lives in
  // which month.
  const dealConditions: string[] = ["setter_id = ?"];
  const dealValues: (string | number)[] = [setterId];
  if (bounds.since) {
    dealConditions.push("COALESCE(closing_date, substr(created_at,1,10)) >= ?");
    dealValues.push(bounds.since);
  }
  if (bounds.until) {
    dealConditions.push("COALESCE(closing_date, substr(created_at,1,10)) <= ?");
    dealValues.push(bounds.until);
  }

  // Per-tier deal aggregates. Capped commissions for no_retainer deals are
  // computed per row — SQLite's two-arg MIN() trims any deal whose 3% / 2%
  // would exceed $500 when the deal is flagged no_retainer.
  const dealAggregates = await db.execute({
    sql: `SELECT
            COUNT(*) AS deals_linked,
            COALESCE(SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END), 0) AS deals_closed,
            COALESCE(SUM(CASE WHEN status = 'closed' THEN deal_value ELSE 0 END), 0) AS revenue_attributed,
            COALESCE(SUM(CASE WHEN status IN ('closed', 'pending_signature') AND paid_status = 'paid' THEN deal_value ELSE 0 END), 0) AS paid_revenue,
            COALESCE(SUM(CASE WHEN status = 'closed' AND IFNULL(paid_status, 'unpaid') = 'unpaid' THEN deal_value ELSE 0 END), 0) AS outstanding_revenue,
            COALESCE(SUM(CASE WHEN status IN ('pending_signature', 'follow_up', 'rescheduled') THEN 1 ELSE 0 END), 0) AS pending_deals,

            COALESCE(SUM(CASE WHEN setter_tier = 'A' AND status = 'closed' AND paid_status = 'paid' THEN 1 ELSE 0 END), 0) AS tier_a_count,
            COALESCE(SUM(CASE WHEN setter_tier = 'A' AND status IN ('closed','pending_signature') AND paid_status = 'paid' THEN deal_value ELSE 0 END), 0) AS tier_a_paid_revenue,
            COALESCE(SUM(
              CASE WHEN setter_tier = 'A' AND status IN ('closed','pending_signature') AND paid_status = 'paid'
                THEN
                  CASE WHEN no_retainer = 1
                    THEN MIN((deal_value * ${TIER_A_BPS}) / 10000, ${NO_RETAINER_CAP_CENTS})
                    ELSE (deal_value * ${TIER_A_BPS}) / 10000
                  END
                ELSE 0
              END
            ), 0) AS tier_a_commission,
            COALESCE(SUM(
              CASE WHEN setter_tier = 'A' AND status = 'closed' AND IFNULL(paid_status,'unpaid') = 'unpaid'
                THEN
                  CASE WHEN no_retainer = 1
                    THEN MIN((deal_value * ${TIER_A_BPS}) / 10000, ${NO_RETAINER_CAP_CENTS})
                    ELSE (deal_value * ${TIER_A_BPS}) / 10000
                  END
                ELSE 0
              END
            ), 0) AS tier_a_commission_pending,

            COALESCE(SUM(CASE WHEN setter_tier = 'B' AND status = 'closed' AND paid_status = 'paid' THEN 1 ELSE 0 END), 0) AS tier_b_count,
            COALESCE(SUM(CASE WHEN setter_tier = 'B' AND status IN ('closed','pending_signature') AND paid_status = 'paid' THEN deal_value ELSE 0 END), 0) AS tier_b_paid_revenue,
            COALESCE(SUM(
              CASE WHEN setter_tier = 'B' AND status IN ('closed','pending_signature') AND paid_status = 'paid'
                THEN
                  CASE WHEN no_retainer = 1
                    THEN MIN((deal_value * ${TIER_B_BPS}) / 10000, ${NO_RETAINER_CAP_CENTS})
                    ELSE (deal_value * ${TIER_B_BPS}) / 10000
                  END
                ELSE 0
              END
            ), 0) AS tier_b_commission,
            COALESCE(SUM(
              CASE WHEN setter_tier = 'B' AND status = 'closed' AND IFNULL(paid_status,'unpaid') = 'unpaid'
                THEN
                  CASE WHEN no_retainer = 1
                    THEN MIN((deal_value * ${TIER_B_BPS}) / 10000, ${NO_RETAINER_CAP_CENTS})
                    ELSE (deal_value * ${TIER_B_BPS}) / 10000
                  END
                ELSE 0
              END
            ), 0) AS tier_b_commission_pending,

            COALESCE(SUM(CASE WHEN setter_tier = 'D' AND status = 'closed' THEN 1 ELSE 0 END), 0) AS tier_d_count
          FROM deals
          WHERE ${dealConditions.join(" AND ")}`,
    args: dealValues,
  });

  // Tier C: per-attended-call fee. Joins the setter's appointments tagged
  // tier=C with the latest event_attendance row — only events with show_status
  // = 'showed' qualify. Window-bound on the appointment itself, since the
  // fee is earned by the setter regardless of whether a deal exists.
  const tierCAggregate = await db.execute({
    sql: `SELECT COUNT(*) AS attended FROM (
            SELECT a.google_event_id,
                   ROW_NUMBER() OVER (PARTITION BY a.google_event_id ORDER BY a.updated_at DESC) AS appt_rn,
                   (SELECT show_status FROM event_attendance ea
                     WHERE ea.google_event_id = a.google_event_id
                  ORDER BY ea.updated_at DESC LIMIT 1) AS show_status
              FROM appointments a
             WHERE a.setter_id = ?
               AND a.setter_tier = 'C'
               ${apptDateClause}
          )
          WHERE appt_rn = 1 AND show_status = 'showed'`,
    args: apptValues,
  });
  const tierCAttended = Number(tierCAggregate.rows[0]?.attended ?? 0);
  const tierCCommission = tierCAttended * TIER_C_FEE_CENTS;

  const a = attendance.rows[0];
  const d = dealAggregates.rows[0];
  const showCount = Number(a?.show_count ?? 0);
  const noShowCount = Number(a?.no_show_count ?? 0);
  const tracked = showCount + noShowCount;
  const paidRevenue = Number(d?.paid_revenue ?? 0);
  const outstandingRevenue = Number(d?.outstanding_revenue ?? 0);

  const tierA = {
    dealCount: Number(d?.tier_a_count ?? 0),
    paidRevenue: Number(d?.tier_a_paid_revenue ?? 0),
    commission: Number(d?.tier_a_commission ?? 0),
  };
  const tierB = {
    dealCount: Number(d?.tier_b_count ?? 0),
    paidRevenue: Number(d?.tier_b_paid_revenue ?? 0),
    commission: Number(d?.tier_b_commission ?? 0),
  };
  const tierC = {
    attendedCount: tierCAttended,
    commission: tierCCommission,
  };
  const tierD = {
    dealCount: Number(d?.tier_d_count ?? 0),
  };

  const tierAPending = Number(d?.tier_a_commission_pending ?? 0);
  const tierBPending = Number(d?.tier_b_commission_pending ?? 0);

  return {
    appointmentsSet: Number(apptCount.rows[0]?.c ?? 0),
    showCount,
    noShowCount,
    showRate: tracked > 0 ? Math.round((showCount / tracked) * 1000) / 10 : 0,
    dealsLinked: Number(d?.deals_linked ?? 0),
    dealsClosed: Number(d?.deals_closed ?? 0),
    revenueAttributed: Number(d?.revenue_attributed ?? 0),
    paidRevenueAttributed: paidRevenue,
    outstandingRevenueAttributed: outstandingRevenue,
    // Tier A + B + C all sum into commissionEarned. Tier D contributes nothing.
    commissionEarned: tierA.commission + tierB.commission + tierC.commission,
    commissionPending: tierAPending + tierBPending,
    pendingDeals: Number(d?.pending_deals ?? 0),
    tierBreakdown: { tierA, tierB, tierC, tierD },
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
                 d.closing_date, d.created_at, d.setter_tier, d.no_retainer,
                 c.display_name AS closer_name
          FROM deals d
          LEFT JOIN closers c ON c.id = d.closer_id
          WHERE d.setter_id = ?
          ORDER BY d.created_at DESC
          LIMIT ?`,
    args: [setterId, limit],
  });

  const base = result.rows.map((row) => {
    const tierRaw = row.setter_tier != null ? String(row.setter_tier) : null;
    return {
      id: String(row.id),
      clientName: String(row.client_name),
      dealValue: Number(row.deal_value ?? 0),
      status: String(row.status),
      paidStatus: String(row.paid_status ?? "unpaid"),
      closingDate: row.closing_date != null ? String(row.closing_date) : null,
      createdAt: String(row.created_at),
      closerName: row.closer_name != null ? String(row.closer_name) : null,
      setterTier: (tierRaw === "A" || tierRaw === "B" || tierRaw === "C" || tierRaw === "D" ? tierRaw : null) as SetterTier | null,
      noRetainer: Number(row.no_retainer ?? 0) === 1,
    };
  });

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
