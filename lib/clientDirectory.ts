import { readUsers, findUser, type UserRecord, type UserStatus } from "./users";
import {
  readAllClientAccounts,
  readAccountsForUser,
  type ClientAccount,
} from "./clientAccounts";
import {
  getAllBrandHistories,
  getRebillPayoutMonthsByBrand,
  normalizeBrandName,
  brandsMatch,
  type BrandHistory,
} from "./payouts";

type RebillMonthsByBrand = Map<
  string,
  Array<{ year: number; month: number; amountDue: number }>
>;
import {
  getAllClientBilling,
  getClientBilling,
  computeRebillSchedule,
  type ClientBilling,
  type RebillSchedule,
} from "./clientBilling";
import { businessToday } from "./businessTime";
import {
  getLatestActiveInvoice,
  getLatestActiveInvoicesByUser,
  reconcileInvoiceForUser,
  type RebillInvoice,
} from "./clientRebillInvoices";
import {
  getAllClientProfiles,
  getClientProfile,
  getAllClientTeams,
  getClientTeam,
  defaultClientProfile,
  deriveAdSpendFeeLabel,
  type ClientProfile,
  type ClientTeamMember,
} from "./clientProfile";
import { listAdAccounts, listAdAccountsForUser, type AdAccount } from "./adAccounts";

// ---------------------------------------------------------------------------
// Aggregated row — superset of the legacy ClientPublic shape. Every field the
// old /api/admin/users response had is preserved (accounts, payoutMrr,
// totalRevenue, hasPassword, …); the new ones are additive.
// ---------------------------------------------------------------------------

export interface ClientDirectoryRow {
  id: string;
  slug: string;
  accountId: string; // legacy single-account field (frozen)
  displayName: string;
  logoPath: string | null;
  email: string | null;
  status: UserStatus;
  mrr: number; // legacy users.mrr (cents) — manual fallback
  category: string | null;
  createdAt: string;
  hasPassword: boolean;
  analystEnabled: boolean;
  designBoardEnabled: boolean;
  designBoardUrl: string | null;
  accounts: ClientAccount[];
  // Payout cross-reference
  payoutBrand: string | null; // explicit link (users.payout_brand)
  matchedBrand: string | null; // resolved brand display name (explicit or fuzzy)
  isLinked: boolean; // matched to at least one payout brand
  payoutMrr: number; // derived recurring MRR (cents) — latest month's amount_due
  totalRevenue: number; // derived total paid across all months (cents)
  joinedAt: string | null; // resolved start date (yyyy-mm-dd)
  // Re-bill schedule
  billing: ClientBilling | null;
  schedule: RebillSchedule;
  /**
   * Current sent re-bill invoice (status='sent'), if one is awaiting payment.
   * Drives the `invoice_sent` schedule status and the dashboard's Sent
   * Invoices panel. Null when no invoice is awaiting payment.
   */
  activeSentInvoice: RebillInvoice | null;
  // Roster (client_profile / client_team) — additive. `profile` always set
  // (defaults applied when no row exists). For book='pepads' the computed
  // `schedule` above stays intact internally but the UI renders the manual
  // billing chips/date instead, and the alerts route excludes the client.
  profile: ClientProfile;
  team: ClientTeamMember[];
  /** Ad-spend fee derived from linked active ad_accounts ("2.5%" / "2–5%"); manual profile.perfFee wins at display time. */
  derivedPerfFee: string | null;
  /** Number of linked ad_accounts rows (purchased ad accounts, NOT Meta-linked `accounts`). */
  adAccountCount: number;
}

/** Normalize a stored timestamp/date to yyyy-mm-dd, best-effort. */
function datePart(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Resolve the payout brand histories that belong to a client. Prefers the
 * explicit link (exact normalized match on users.payout_brand); falls back to
 * fuzzy brand matching on the display name for unlinked clients.
 */
function matchHistories(
  user: UserRecord,
  histories: BrandHistory[]
): BrandHistory[] {
  const linkNorm = user.payoutBrand ? normalizeBrandName(user.payoutBrand) : "";
  if (linkNorm) {
    const exact = histories.filter((h) => h.normalizedName === linkNorm);
    if (exact.length > 0) return exact;
    // Explicit brand set but no exact row — fall back to fuzzy on the link.
    const fuzzy = histories.filter((h) => brandsMatch(linkNorm, h.normalizedName));
    if (fuzzy.length > 0) return fuzzy;
  }
  const nameNorm = normalizeBrandName(user.displayName);
  if (!nameNorm) return [];
  return histories.filter((h) => brandsMatch(nameNorm, h.normalizedName));
}

/**
 * Build one enriched directory row. Pure assembly given the inputs — shared by
 * the full-directory build and the single-client detail so both compute MRR and
 * the re-bill schedule identically. Returns the matched payout brand timelines
 * too (used by the per-client billing/payment view).
 */
function buildRow(
  user: UserRecord,
  accounts: ClientAccount[],
  /**
   * This user's matched payout brand timelines — `matchHistories(user, ...)`,
   * computed once by the caller. Fuzzy matching costs O(all brands) per call,
   * so the caller shares one result between invoice reconciliation and row
   * assembly instead of re-matching here.
   */
  matched: BrandHistory[],
  billing: ClientBilling | null,
  /**
   * Already-reconciled invoice for this user. Callers must run
   * `reconcileInvoiceForUser` first so a `paid` promotion is applied before we
   * read its status here — otherwise the schedule would still say
   * `invoice_sent` for a cycle the payout DB has already recognised.
   */
  activeSentInvoice: RebillInvoice | null,
  rebillByBrand: RebillMonthsByBrand,
  profile: ClientProfile,
  team: ClientTeamMember[],
  adAccounts: AdAccount[],
  today?: Date
): { row: ClientDirectoryRow; matched: BrandHistory[] } {
  // Recurring MRR. Default = the latest payout month's amount_due (summed
  // across matched brands). A per-client override (billing.mrrMonthOverride,
  // "yyyy-mm") pins MRR to a chosen month so a one-off "additional service"
  // payment landing as the newest month isn't mistaken for recurring revenue.
  // Falls back to latest if the pinned month is no longer present.
  let payoutMrr = matched.reduce((s, h) => s + h.latestAmountDue, 0);
  const mrrOverride = billing?.mrrMonthOverride ?? null;
  if (mrrOverride) {
    const mm = mrrOverride.match(/^(\d{4})-(\d{2})$/);
    if (mm) {
      const y = Number(mm[1]);
      const mo = Number(mm[2]);
      let sum = 0;
      let found = false;
      for (const h of matched) {
        const entry = h.months.find((e) => e.year === y && e.month === mo);
        if (entry) {
          sum += entry.amountDue;
          found = true;
        }
      }
      if (found) payoutMrr = sum;
    }
  }
  const totalRevenue = matched.reduce((s, h) => s + h.totalPaid, 0);

  // Earliest payout join date across matched brands.
  let earliestPayoutJoin: string | null = null;
  for (const h of matched) {
    if (h.earliestDateJoined) {
      const d = datePart(h.earliestDateJoined);
      if (d && (!earliestPayoutJoin || d < earliestPayoutJoin)) {
        earliestPayoutJoin = d;
      }
    }
  }

  // Resolved start date: explicit users.joined_at → payout date_joined →
  // account creation date. Drives the directory column + billing anchor.
  const joinedAt =
    datePart(user.joinedAt) ?? earliestPayoutJoin ?? datePart(user.createdAt);

  // All (year, month) pairs that have a payout for this client.
  const payoutMonths = matched.flatMap((h) =>
    h.months.map((m) => ({ year: m.year, month: m.month }))
  );

  // Only a still-sent invoice influences the schedule status (paid/unpaid/
  // superseded are historical records, not awaiting-payment signals).
  const sentForSchedule =
    activeSentInvoice && activeSentInvoice.status === "sent"
      ? { cycleAnchor: activeSentInvoice.cycleAnchor }
      : null;

  // Confirmed-paid months: REBILL-flagged payouts whose amount_due matches the
  // brand's recurring re-bill amount (its most recent REBILL month — the
  // established baseline), evaluated PER BRAND so a multi-brand client or a
  // month with mixed rebill/non-rebill rows still resolves correctly. A
  // matching REBILL payment marks the client `paid` until the next re-bill date.
  const paidMonths = matched.flatMap((h) => {
    const months = rebillByBrand.get(h.normalizedName) ?? [];
    if (months.length === 0) return [];
    const sorted = [...months].sort(
      (a, b) => a.year - b.year || a.month - b.month
    );
    const baseline = sorted[sorted.length - 1].amountDue;
    return sorted
      .filter((m) => m.amountDue === baseline)
      .map((m) => ({ year: m.year, month: m.month }));
  });

  const schedule = computeRebillSchedule({
    anchorDate: joinedAt,
    billing,
    payoutMonths,
    paidMonths,
    today,
    activeSentInvoice: sentForSchedule,
  });

  const matchedBrand =
    user.payoutBrand ?? (matched.length > 0 ? matched[0].displayBrand : null);

  const row: ClientDirectoryRow = {
    id: user.id,
    slug: user.slug,
    accountId: user.accountId,
    displayName: user.displayName,
    logoPath: user.logoPath,
    email: user.email,
    status: user.status,
    mrr: user.mrr,
    category: user.category,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    analystEnabled: user.analystEnabled,
    designBoardEnabled: user.designBoardEnabled,
    designBoardUrl: user.designBoardUrl,
    accounts,
    payoutBrand: user.payoutBrand,
    matchedBrand,
    isLinked: matched.length > 0,
    payoutMrr,
    totalRevenue,
    joinedAt,
    billing,
    schedule,
    // Surface only a still-sent invoice. Once promoted to paid (or marked
    // unpaid / superseded), it's no longer "current" — the panel & banner
    // should ignore it.
    activeSentInvoice:
      activeSentInvoice && activeSentInvoice.status === "sent"
        ? activeSentInvoice
        : null,
    profile,
    team,
    derivedPerfFee: deriveAdSpendFeeLabel(adAccounts),
    adAccountCount: adAccounts.length,
  };
  return { row, matched };
}

/**
 * Build the full Client Directory — one enriched row per client. Shared by the
 * directory list endpoint and the re-bill alert computation so both see the
 * same numbers.
 */
export async function buildClientDirectory(
  today?: Date
): Promise<ClientDirectoryRow[]> {
  // Billing-cycle math runs in the business timezone (see businessTime.ts), not
  // the UTC server clock — keeps "due"/"overdue"/anchor dates on the agency's
  // calendar day and consistent with what the send routes stamp.
  const t = today ?? businessToday();
  const [
    users,
    allAccounts,
    histories,
    billingMap,
    invoiceMap,
    rebillByBrand,
    profileMap,
    teamMap,
    allAdAccounts,
  ] = await Promise.all([
    readUsers(),
    readAllClientAccounts(),
    getAllBrandHistories(),
    getAllClientBilling(),
    getLatestActiveInvoicesByUser(),
    getRebillPayoutMonthsByBrand(),
    getAllClientProfiles(),
    getAllClientTeams(),
    listAdAccounts(),
  ]);

  const accountsByUser = new Map<string, ClientAccount[]>();
  for (const account of allAccounts) {
    const list = accountsByUser.get(account.userId) ?? [];
    list.push(account);
    accountsByUser.set(account.userId, list);
  }

  const adAccountsByUser = new Map<string, AdAccount[]>();
  for (const acct of allAdAccounts) {
    if (!acct.userId) continue;
    const list = adAccountsByUser.get(acct.userId) ?? [];
    list.push(acct);
    adAccountsByUser.set(acct.userId, list);
  }

  // Fuzzy brand matching costs O(all brands) per user — match each user once
  // here and share the result between invoice reconciliation and row assembly.
  const matchedByUser = new Map(
    users.map((user) => [user.id, matchHistories(user, histories)] as const)
  );

  // Pre-compute each matched-user's payout months and reconcile their active
  // invoice (sent → paid if the cycle's payout has landed) in parallel before
  // we build the rows. Reconciliation is best-effort: a write failure leaves
  // the invoice as `sent` and the next directory build retries.
  const reconciled = await Promise.all(
    users.map(async (user) => {
      const invoice = invoiceMap.get(user.id) ?? null;
      if (!invoice) return [user.id, null] as const;
      const matched = matchedByUser.get(user.id) ?? [];
      const payoutMonths = matched.flatMap((h) =>
        h.months.map((m) => ({ year: m.year, month: m.month }))
      );
      const updated = await reconcileInvoiceForUser(invoice, payoutMonths);
      return [user.id, updated] as const;
    })
  );
  const invoiceByUser = new Map(reconciled);

  return users.map(
    (user) =>
      buildRow(
        user,
        accountsByUser.get(user.id) ?? [],
        matchedByUser.get(user.id) ?? [],
        billingMap.get(user.id) ?? null,
        invoiceByUser.get(user.id) ?? null,
        rebillByBrand,
        profileMap.get(user.id) ?? defaultClientProfile(user.id),
        teamMap.get(user.id) ?? [],
        adAccountsByUser.get(user.id) ?? [],
        t
      ).row
  );
}

export interface ClientDetail {
  row: ClientDirectoryRow;
  /** matched payout brand timelines — the client's payment history */
  history: BrandHistory[];
}

/**
 * Single-client detail: the same enriched row as the directory plus the matched
 * payout brand timelines (payment history for the billing tab). Returns null if
 * the client doesn't exist.
 */
export async function getClientDetail(
  userId: string,
  today?: Date
): Promise<ClientDetail | null> {
  const user = await findUser(userId);
  if (!user) return null;

  // See buildClientDirectory: pin "today" to the business day so the single-
  // client detail (which the send route reads for cycle_anchor) agrees with it.
  const t = today ?? businessToday();

  const [accounts, histories, billing, rawInvoice, rebillByBrand, profile, team, adAccounts] =
    await Promise.all([
      readAccountsForUser(userId),
      getAllBrandHistories(),
      getClientBilling(userId),
      getLatestActiveInvoice(userId),
      getRebillPayoutMonthsByBrand(),
      getClientProfile(userId),
      getClientTeam(userId),
      listAdAccountsForUser(userId),
    ]);

  // Reconcile this user's invoice against their payouts before building the
  // row so a freshly-recognised payment promotes status before render.
  const matchedHistories = matchHistories(user, histories);
  const payoutMonths = matchedHistories.flatMap((h) =>
    h.months.map((m) => ({ year: m.year, month: m.month }))
  );
  const invoice = await reconcileInvoiceForUser(rawInvoice, payoutMonths);

  const { row, matched } = buildRow(
    user,
    accounts,
    matchedHistories,
    billing,
    invoice,
    rebillByBrand,
    profile ?? defaultClientProfile(userId),
    team,
    adAccounts,
    t
  );
  return { row, history: matched };
}

// ---------------------------------------------------------------------------
// Add-from-payout pool — payout brands not yet represented by a client
// ---------------------------------------------------------------------------

export interface PayoutPoolEntry {
  brandName: string; // original display brand_name
  normalizedName: string;
  dateJoined: string | null; // earliest payout date_joined
  monthlyAmount: number; // latest month's amount_due (cents) — MRR proxy
  totalPaid: number; // cents
  vertical: string | null;
  service: string | null;
}

/**
 * Payout brands with no matching client yet, optionally filtered to those whose
 * date_joined falls within [since, until] (yyyy-mm-dd, inclusive). Powers the
 * "add client from the Payout DB" picker (defaults to the past week in the UI).
 */
export async function getPayoutPool(opts?: {
  since?: string | null;
  until?: string | null;
}): Promise<PayoutPoolEntry[]> {
  const [users, histories] = await Promise.all([
    readUsers(),
    getAllBrandHistories(),
  ]);

  // Normalized keys already claimed by a client (explicit link or fuzzy name).
  const claimed = new Set<string>();
  for (const u of users) {
    if (u.payoutBrand) claimed.add(normalizeBrandName(u.payoutBrand));
    const nameNorm = normalizeBrandName(u.displayName);
    if (nameNorm) claimed.add(nameNorm);
  }

  const since = opts?.since ?? null;
  const until = opts?.until ?? null;

  const pool: PayoutPoolEntry[] = [];
  for (const h of histories) {
    // Skip if any claimed key matches this brand.
    let isClaimed = claimed.has(h.normalizedName);
    if (!isClaimed) {
      for (const key of claimed) {
        if (brandsMatch(key, h.normalizedName)) {
          isClaimed = true;
          break;
        }
      }
    }
    if (isClaimed) continue;

    const dj = datePart(h.earliestDateJoined);
    if (since && (!dj || dj < since)) continue;
    if (until && (!dj || dj > until)) continue;

    pool.push({
      brandName: h.displayBrand,
      normalizedName: h.normalizedName,
      dateJoined: dj,
      monthlyAmount: h.latestAmountDue,
      totalPaid: h.totalPaid,
      vertical: h.vertical,
      service: h.service,
    });
  }

  // Most recent joiners first; undated brands sink to the bottom.
  pool.sort((a, b) => (b.dateJoined ?? "").localeCompare(a.dateJoined ?? ""));
  return pool;
}
