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
  Array<{ year: number; month: number; amountDue: number; rows: number }>
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
  getConsumedPayoutMonthsByKey,
  getPaidCycleMonthsByKey,
} from "./invoiceManualOverride";
import {
  getSentInvoicesForUser,
  getSentInvoicesByUser,
  reconcileInvoicesForUser,
  pickActiveSentInvoice,
  rebillPaymentUnits,
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
import { inWorkspaceScope, type WorkspaceScope } from "./workspaces";

/**
 * Filter directory (or any workspace-carrying) rows down to an actor's
 * workspace scope. Every admin-facing list route MUST pass its actor's scope
 * through here (or check inWorkspaceScope per row) — the build itself is
 * unscoped so unscoped callers (team hub, alerts for supers) share one build.
 */
export function filterRowsByWorkspace<T extends { workspace: string }>(
  rows: T[],
  scope: WorkspaceScope
): T[] {
  if (scope === null) return rows;
  return rows.filter((r) => inWorkspaceScope(scope, r.workspace));
}

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
  /** Workspace (book) slug — 'main' is the original Agency Collective book. */
  workspace: string;
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
   * The awaiting-payment invoice that represents this client's billing NOW:
   * the one anchored to the current cycle (`schedule.nextRebillAt`) when
   * there is one, else the newest still-sent invoice. Null when nothing is
   * awaiting payment.
   */
  activeSentInvoice: RebillInvoice | null;
  /**
   * EVERY still-sent invoice (newest first) — a client can be awaiting
   * payment on more than one cycle (an earlier month still unpaid, a
   * backfill, a reopened row). Powers the Sent Invoices panel + follow-ups.
   */
  sentInvoices: RebillInvoice[];
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
 *
 * SECURITY: clients OUTSIDE the main book match ONLY via the explicit link,
 * exact — no fuzzy fallback, no display-name matching. brandsMatch is
 * substring-based, so a partner-book client named "Glow" would otherwise
 * pull the internal brand "Inner Glow"'s payment history (and MRR/LTV) into
 * a view an external admin can read. The link itself is internally managed
 * (updateUserAction rejects payout-brand edits from external actors).
 */
function matchHistories(
  user: UserRecord,
  histories: BrandHistory[]
): BrandHistory[] {
  const linkNorm = user.payoutBrand ? normalizeBrandName(user.payoutBrand) : "";
  if (user.workspace !== "main") {
    if (!linkNorm) return [];
    return histories.filter((h) => h.normalizedName === linkNorm);
  }
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
 * Qualifying re-bill payments for a client: REBILL-flagged payout months whose
 * amount_due is the brand's recurring re-bill amount (or an exact multiple of
 * it — a catch-up month yields one entry per cycle it covers), evaluated PER
 * BRAND via rebillPaymentUnits. This is the single definition of "the
 * recurring bill was actually paid" — it feeds BOTH the schedule's
 * `paidMonths` and invoice reconciliation, so a one-off non-REBILL payout can
 * never promote a sent invoice to `paid`.
 */
function qualifyingRebillMonths(
  matched: BrandHistory[],
  rebillByBrand: RebillMonthsByBrand
): Array<{ year: number; month: number }> {
  return matched.flatMap((h) => rebillPaymentUnits(rebillByBrand.get(h.normalizedName) ?? []));
}

/**
 * Qualifying REBILL months for one client (same rule the directory feeds the
 * schedule + reconciliation). Used by the manual-override route after a
 * "Resync" so the reopened invoice is re-evaluated against payouts at once.
 */
export async function qualifyingMonthsForUser(
  user: UserRecord
): Promise<Array<{ year: number; month: number }>> {
  const [histories, rebillByBrand] = await Promise.all([
    getAllBrandHistories(),
    getRebillPayoutMonthsByBrand(),
  ]);
  return qualifyingRebillMonths(matchHistories(user, histories), rebillByBrand);
}

/**
 * The brand a client's payouts are matched under — the explicit link, or (main
 * book only) the display name. Non-main clients never fall back to the name
 * (see matchHistories). Null = no payout basis at all.
 */
export function payoutBrandBasisForUser(user: UserRecord): string | null {
  if (user.workspace !== "main") return user.payoutBrand;
  return user.payoutBrand ?? user.displayName ?? null;
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
   * This user's already-reconciled sent invoices (newest first). Callers must
   * run `reconcileInvoicesForUser` on them first so a `paid` promotion is
   * applied before we read statuses here — otherwise the schedule would still
   * say `invoice_sent` for a cycle the payout DB has already recognised.
   */
  reconciledInvoices: RebillInvoice[],
  rebillByBrand: RebillMonthsByBrand,
  profile: ClientProfile,
  team: ClientTeamMember[],
  adAccounts: AdAccount[],
  /**
   * Cycle months of this client's PAID re-bill invoices (any source). Merged
   * into BOTH `payoutMonths` (advances the next bill) and `paidMonths` (the
   * Paid chip) so a cycle an admin settled by hand — or linked to a payout
   * recorded under a different month — behaves like a payout-recognised one.
   * Invoice reconciliation stays on the qualifying-payout months only. See
   * lib/invoiceManualOverride.ts.
   */
  paidInvoiceMonths: Array<{ year: number; month: number }>,
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

  // All (year, month) pairs that have a payout for this client — PLUS the
  // cycle months of paid invoices, so a cycle an admin settled by hand
  // advances the next-bill date exactly as a recorded payout would (else the
  // row would read "Paid" and "Overdue" at once and stay in the alerts).
  const payoutMonths = [
    ...matched.flatMap((h) =>
      h.months.map((m) => ({ year: m.year, month: m.month }))
    ),
    ...paidInvoiceMonths,
  ];

  // Only still-sent invoices influence the schedule status (paid/unpaid/
  // superseded are historical records, not awaiting-payment signals). ANY of
  // them anchored to the current cycle lights `invoice_sent`.
  const sentInvoices = reconciledInvoices.filter((i) => i.status === "sent");

  // Confirmed-paid months: REBILL-flagged payouts whose amount_due matches the
  // brand's recurring re-bill amount (its most recent REBILL month — the
  // established baseline), evaluated PER BRAND so a multi-brand client or a
  // month with mixed rebill/non-rebill rows still resolves correctly. A
  // matching REBILL payment marks the client `paid` until the next re-bill date.
  const paidMonths = [
    ...qualifyingRebillMonths(matched, rebillByBrand),
    ...paidInvoiceMonths,
  ];

  const schedule = computeRebillSchedule({
    anchorDate: joinedAt,
    billing,
    payoutMonths,
    paidMonths,
    today,
    sentCycleAnchors: sentInvoices.map((i) => i.cycleAnchor),
  });
  const activeSentInvoice = pickActiveSentInvoice(
    sentInvoices,
    schedule.nextRebillAt
  );

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
    workspace: user.workspace,
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
    // Only still-sent invoices surface. Once promoted to paid (or marked
    // unpaid / superseded), an invoice is history — the panel & banner
    // ignore it.
    activeSentInvoice,
    sentInvoices,
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
 *
 * Single-flight: one page load fires several routes (users, rebill-alerts,
 * sent-invoices) that each need the directory — concurrent default-`today`
 * callers share one in-flight build instead of each paying the full pipeline
 * (~9 parallel queries + reconciliation). No TTL cache on purpose: mutations
 * invalidate client queries and the refetch must observe fresh data.
 */
let inflightDirectoryBuild: Promise<ClientDirectoryRow[]> | null = null;

export async function buildClientDirectory(
  today?: Date
): Promise<ClientDirectoryRow[]> {
  // An explicit `today` is a different input — bypass the shared build.
  if (today) return buildClientDirectoryNow(today);
  if (inflightDirectoryBuild) return inflightDirectoryBuild;
  const build = buildClientDirectoryNow().finally(() => {
    inflightDirectoryBuild = null;
  });
  inflightDirectoryBuild = build;
  return build;
}

async function buildClientDirectoryNow(
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
    sentByUser,
    rebillByBrand,
    profileMap,
    teamMap,
    allAdAccounts,
    paidInvoiceMonthsByUser,
    consumedByUser,
  ] = await Promise.all([
    readUsers(),
    readAllClientAccounts(),
    getAllBrandHistories(),
    getAllClientBilling(),
    getSentInvoicesByUser(),
    getRebillPayoutMonthsByBrand(),
    getAllClientProfiles(),
    getAllClientTeams(),
    listAdAccounts(),
    getPaidCycleMonthsByKey("client_rebill_invoices", "user_id"),
    getConsumedPayoutMonthsByKey("client_rebill_invoices", "user_id"),
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

  // Reconcile EVERY sent invoice of each user (sent → paid if the cycle's
  // payout has landed) before we build the rows — an older-cycle or reopened
  // row must get the same chance to settle as the newest one, and each payout
  // month settles at most one of them (allocateAutoPaid).
  // Best-effort: a write failure leaves the invoice `sent` and the next
  // directory build retries.
  const reconciled = await Promise.all(
    users.map(async (user) => {
      const sent = sentByUser.get(user.id) ?? [];
      if (sent.length === 0) return [user.id, [] as RebillInvoice[]] as const;
      // Reconcile against qualifying REBILL months only — an unrelated one-off
      // payout must not mark a sent re-bill invoice as paid (mirrors the
      // schedule's paidMonths and the ad-account directory's flagged filter).
      const months = qualifyingRebillMonths(
        matchedByUser.get(user.id) ?? [],
        rebillByBrand
      );
      // Together, so one payment settles at most one open invoice — and minus
      // the payments this client's paid invoices already used.
      return [
        user.id,
        await reconcileInvoicesForUser(sent, months, consumedByUser.get(user.id) ?? []),
      ] as const;
    })
  );
  const invoicesByUser = new Map(reconciled);

  return users.map(
    (user) =>
      buildRow(
        user,
        accountsByUser.get(user.id) ?? [],
        matchedByUser.get(user.id) ?? [],
        billingMap.get(user.id) ?? null,
        invoicesByUser.get(user.id) ?? [],
        rebillByBrand,
        profileMap.get(user.id) ?? defaultClientProfile(user.id),
        teamMap.get(user.id) ?? [],
        adAccountsByUser.get(user.id) ?? [],
        paidInvoiceMonthsByUser.get(user.id) ?? [],
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

  const [
    accounts,
    histories,
    billing,
    rawSent,
    rebillByBrand,
    profile,
    team,
    adAccounts,
    paidInvoiceMonthsByUser,
    consumedByUser,
  ] = await Promise.all([
    readAccountsForUser(userId),
    getAllBrandHistories(),
    getClientBilling(userId),
    getSentInvoicesForUser(userId),
    getRebillPayoutMonthsByBrand(),
    getClientProfile(userId),
    getClientTeam(userId),
    listAdAccountsForUser(userId),
    getPaidCycleMonthsByKey("client_rebill_invoices", "user_id"),
    getConsumedPayoutMonthsByKey("client_rebill_invoices", "user_id", userId),
  ]);

  // Reconcile this user's sent invoices against their qualifying REBILL
  // payouts before building the row so a freshly-recognised payment promotes
  // status before render (one-off non-REBILL payouts deliberately don't
  // qualify).
  const matchedHistories = matchHistories(user, histories);
  const qualifying = qualifyingRebillMonths(matchedHistories, rebillByBrand);
  const invoices = await reconcileInvoicesForUser(
    rawSent,
    qualifying,
    consumedByUser.get(userId) ?? []
  );

  const { row, matched } = buildRow(
    user,
    accounts,
    matchedHistories,
    billing,
    invoices,
    rebillByBrand,
    profile ?? defaultClientProfile(userId),
    team,
    adAccounts,
    paidInvoiceMonthsByUser.get(userId) ?? [],
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
 * Payout brands no client's directory row consumes. A brand is claimed exactly
 * when `matchHistories` attributes it to some client — the SAME rule that
 * drives MRR/revenue/schedule — so the pool can neither hide a brand nobody
 * bills (e.g. client "Nextgen" linked to "NextGen Peptides" must not swallow
 * "NextGen BioLabs" via a display-name substring) nor offer one that a
 * client already counts (importing it would double-count its payouts).
 */
export function unclaimedBrandHistories(
  users: UserRecord[],
  histories: BrandHistory[]
): BrandHistory[] {
  const claimed = new Set<string>();
  for (const u of users) {
    for (const h of matchHistories(u, histories)) claimed.add(h.normalizedName);
  }
  return histories.filter((h) => !claimed.has(h.normalizedName));
}

/**
 * Payout brands with no matching client yet, optionally filtered to those whose
 * date_joined falls within [since, until] (yyyy-mm-dd, inclusive). Powers the
 * "add client from the Payout DB" picker (defaults to the past week in the UI).
 * A brand with no date_joined is windowed by its first payout month instead —
 * Payout Month is set explicitly (not derived from Date Joined), so an undated
 * new brand would otherwise be invisible under every date window.
 */
export async function getPayoutPool(opts?: {
  since?: string | null;
  until?: string | null;
}): Promise<PayoutPoolEntry[]> {
  const [users, histories] = await Promise.all([
    readUsers(),
    getAllBrandHistories(),
  ]);

  const since = opts?.since ?? null;
  const until = opts?.until ?? null;

  const pool: PayoutPoolEntry[] = [];
  for (const h of unclaimedBrandHistories(users, histories)) {
    const dj = datePart(h.earliestDateJoined);
    const first = h.months[0];
    const windowDate =
      dj ??
      (first ? `${first.year}-${String(first.month).padStart(2, "0")}-01` : null);
    if (since && (!windowDate || windowDate < since)) continue;
    if (until && (!windowDate || windowDate > until)) continue;

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
