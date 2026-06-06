import { readUsers, type UserRecord } from "./users";
import {
  normalizeBrandName,
  brandsMatch,
  getAdAccountPayoutMonthsByBrand,
} from "./payouts";
import {
  computeRebillSchedule,
  isRebillAlertStatus,
  type RebillSchedule,
  type ClientBilling,
} from "./clientBilling";
import {
  getSentInvoicesByAdAccount,
  reconcileInvoiceForAdAccount,
  type AdAccountInvoice,
} from "./adAccountInvoices";
import { listAdAccounts, type AdAccount, type AdAccountStatus } from "./adAccounts";
import { businessToday } from "./businessTime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdAccountDirectoryRow {
  id: string;
  accountName: string;
  vendor: string | null;
  platform: string | null;
  adSpendFeeBps: number;
  monthlyRetainerCents: number;
  status: AdAccountStatus;
  notes: string | null;
  createdAt: string;
  // Billing-schedule controls
  billingPaused: boolean;
  billingDay: number | null;
  leadDays: number;
  extendUntil: string | null;
  lastBilledOverride: string | null;
  // Linked client (null = unattached)
  userId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  matchedBrand: string | null;
  // Billing schedule (monthly, same engine as client re-bill)
  schedule: RebillSchedule;
  activeSentInvoice: AdAccountInvoice | null;
}

export interface AdAccountSummary {
  total: number;
  active: number;
  totalValueCents: number; // sum of monthly retainers across ALL ad accounts
  billsDue: number; // active accounts due or overdue
  overdue: number;
}

export interface AdAccountDirectory {
  rows: AdAccountDirectoryRow[];
  summary: AdAccountSummary;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** yyyy-mm-dd from a stored timestamp, best-effort. */
function datePart(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Resolve a client's brand → its "Ad Account"-flagged payout months. */
function adAccountMonthsForBrand(
  brand: string | null,
  byBrand: Map<string, Array<{ year: number; month: number }>>
): Array<{ year: number; month: number }> {
  if (!brand) return [];
  const norm = normalizeBrandName(brand);
  if (!norm) return [];
  const exact = byBrand.get(norm);
  const months: Array<{ year: number; month: number }> = exact ? [...exact] : [];
  for (const [key, arr] of byBrand) {
    if (key === norm) continue;
    if (brandsMatch(norm, key)) months.push(...arr);
  }
  return months;
}

export async function buildAdAccountDirectory(
  today?: Date
): Promise<AdAccountDirectory> {
  // Day-granular billing math runs in the business timezone, not the UTC server
  // clock — otherwise statuses/dates flip a day early every evening (PT) and the
  // recomputed `nextRebillAt` won't match a just-sent invoice's `cycle_anchor`.
  const t = today ?? businessToday();
  const [accounts, users, adAccountMonthsMap, sentByAccount] = await Promise.all([
    listAdAccounts(),
    readUsers(),
    getAdAccountPayoutMonthsByBrand(),
    getSentInvoicesByAdAccount(),
  ]);

  const usersById = new Map<string, UserRecord>();
  for (const u of users) usersById.set(u.id, u);

  const rows: AdAccountDirectoryRow[] = await Promise.all(
    accounts.map(async (acct) => {
      const client = acct.userId ? usersById.get(acct.userId) ?? null : null;
      const matchedBrand =
        client?.payoutBrand ?? client?.displayName ?? null;
      const payoutMonths = adAccountMonthsForBrand(matchedBrand, adAccountMonthsMap);

      // Reconcile EVERY sent invoice for this account (sent → paid) before
      // reading status — backdated/registered rows (supersede:false) coexist
      // with the current one and must each get a chance to settle.
      // LIMITATION: matching is per-brand (the payout's Sales Rep flags it as an
      // "Ad Account" payment for the brand, but carries no per-account id). When
      // a brand has multiple ad accounts, a single ad-account payout satisfies
      // every one of that brand's sent invoices — correct when one payment
      // covers them all, but it can't attribute a payment to a single account.
      // This mirrors the per-brand REBILL reconciliation; the common case (one
      // ad account per client) is exact.
      const sentList = sentByAccount.get(acct.id) ?? [];
      const reconciled = await Promise.all(
        sentList.map((inv) => reconcileInvoiceForAdAccount(inv, payoutMonths))
      );
      // Newest still-sent invoice drives the schedule's invoice_sent status.
      const invoice = reconciled.find((i) => i && i.status === "sent") ?? null;

      // Billing starts when the account is assigned → anchor on its createdAt.
      // Per-account schedule controls (pause / billing day / lead / extend /
      // manual last-billed) are stored on the ad_accounts row and mapped onto
      // the shared ClientBilling shape the schedule engine consumes.
      const billing: ClientBilling = {
        userId: acct.userId ?? "",
        cadence: "monthly",
        billingDay: acct.billingDay,
        paused: acct.billingPaused,
        pauseReason: null,
        extendUntil: acct.extendUntil,
        lastRebilledOverride: acct.lastBilledOverride,
        mrrMonthOverride: null,
        leadDays: acct.leadDays,
        settingsNotes: null,
        createdAt: acct.createdAt,
        updatedAt: acct.updatedAt,
      };
      const sentForSchedule =
        invoice && invoice.status === "sent"
          ? { cycleAnchor: invoice.cycleAnchor }
          : null;
      const schedule = computeRebillSchedule({
        anchorDate: datePart(acct.createdAt),
        billing,
        payoutMonths,
        // Every Ad-Account-flagged payout month is a confirmed payment, so the
        // account shows `paid` until the next bill once one lands.
        paidMonths: payoutMonths,
        today: t,
        activeSentInvoice: sentForSchedule,
      });

      return {
        id: acct.id,
        accountName: acct.accountName,
        vendor: acct.vendor,
        platform: acct.platform,
        adSpendFeeBps: acct.adSpendFeeBps,
        monthlyRetainerCents: acct.monthlyRetainerCents,
        status: acct.status,
        notes: acct.notes,
        createdAt: acct.createdAt,
        billingPaused: acct.billingPaused,
        billingDay: acct.billingDay,
        leadDays: acct.leadDays,
        extendUntil: acct.extendUntil,
        lastBilledOverride: acct.lastBilledOverride,
        userId: acct.userId,
        clientName: client?.displayName ?? null,
        clientEmail: client?.email ?? null,
        matchedBrand,
        schedule,
        activeSentInvoice:
          invoice && invoice.status === "sent" ? invoice : null,
      } satisfies AdAccountDirectoryRow;
    })
  );

  const summary: AdAccountSummary = {
    total: rows.length,
    active: 0,
    totalValueCents: 0,
    billsDue: 0,
    overdue: 0,
  };
  for (const r of rows) {
    // Total value spans every ad account regardless of status.
    summary.totalValueCents += r.monthlyRetainerCents;
    if (r.status !== "active") continue;
    summary.active += 1;
    if (isRebillAlertStatus(r.schedule.status)) summary.billsDue += 1;
    if (r.schedule.status === "overdue") summary.overdue += 1;
  }

  return { rows, summary };
}
