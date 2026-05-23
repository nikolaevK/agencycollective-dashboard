import { readUsers, findUser, type UserRecord, type UserStatus } from "./users";
import {
  readAllClientAccounts,
  readAccountsForUser,
  type ClientAccount,
} from "./clientAccounts";
import {
  getAllBrandHistories,
  normalizeBrandName,
  brandsMatch,
  type BrandHistory,
} from "./payouts";
import {
  getAllClientBilling,
  getClientBilling,
  computeRebillSchedule,
  type ClientBilling,
  type RebillSchedule,
} from "./clientBilling";

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
  histories: BrandHistory[],
  billing: ClientBilling | null,
  today?: Date
): { row: ClientDirectoryRow; matched: BrandHistory[] } {
  const matched = matchHistories(user, histories);

  const payoutMrr = matched.reduce((s, h) => s + h.latestAmountDue, 0);
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

  const schedule = computeRebillSchedule({
    anchorDate: joinedAt,
    billing,
    payoutMonths,
    today,
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
    accounts,
    payoutBrand: user.payoutBrand,
    matchedBrand,
    isLinked: matched.length > 0,
    payoutMrr,
    totalRevenue,
    joinedAt,
    billing,
    schedule,
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
  const [users, allAccounts, histories, billingMap] = await Promise.all([
    readUsers(),
    readAllClientAccounts(),
    getAllBrandHistories(),
    getAllClientBilling(),
  ]);

  const accountsByUser = new Map<string, ClientAccount[]>();
  for (const account of allAccounts) {
    const list = accountsByUser.get(account.userId) ?? [];
    list.push(account);
    accountsByUser.set(account.userId, list);
  }

  return users.map(
    (user) =>
      buildRow(
        user,
        accountsByUser.get(user.id) ?? [],
        histories,
        billingMap.get(user.id) ?? null,
        today
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

  const [accounts, histories, billing] = await Promise.all([
    readAccountsForUser(userId),
    getAllBrandHistories(),
    getClientBilling(userId),
  ]);

  const { row, matched } = buildRow(user, accounts, histories, billing, today);
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
