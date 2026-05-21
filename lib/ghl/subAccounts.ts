// GHL sub-account registry.
//
// Each entry maps a stable internal id to its env-resolved PIT + locationId
// and the display metadata the UI needs (label + short badge). Sub-accounts
// are addressed by id everywhere; the env mapping is a single source of truth
// here so adding/renaming an account is a one-file change.
//
// Existing single-account installs work unchanged: GHL_PIT / GHL_LOCATION_ID
// continue to back the "peptide" account, which is the default for every
// codepath that doesn't pass an explicit sub-account id.

export type GhlSubAccountId = "peptide" | "agency";

export interface GhlSubAccount {
  id: GhlSubAccountId;
  label: string;       // Full display name shown in tabs, tooltips, settings.
  shortLabel: string;  // 2-letter badge shown inline on calendar event cards.
  // Tailwind classes for the inline badge. Different hues per sub-account so
  // calendars from two sources are visually distinct at a glance.
  badgeClass: string;
}

// Ordered list — the first configured account is the UI default tab unless
// the caller overrides via URL (?subAccount=...).
export const SUB_ACCOUNTS: readonly GhlSubAccount[] = [
  {
    id: "agency",
    label: "Agency Collective",
    shortLabel: "AC",
    badgeClass:
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  {
    id: "peptide",
    label: "Peptide Ads",
    shortLabel: "PA",
    badgeClass:
      "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
  },
];

// Sub-account every backward-compatible callsite defaults to. Pinned to
// "peptide" because the existing GHL_PIT / GHL_LOCATION_ID env vars point
// there — flipping this would silently re-route every legacy push/pull at a
// stale link row.
export const DEFAULT_SUB_ACCOUNT_ID: GhlSubAccountId = "peptide";

// UI default for the contacts page when no URL override is present. Per
// product direction, Agency is the home brand.
export const DEFAULT_UI_SUB_ACCOUNT_ID: GhlSubAccountId = "agency";

export function getSubAccount(id: GhlSubAccountId): GhlSubAccount {
  const found = SUB_ACCOUNTS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown GHL sub-account id: ${id}`);
  return found;
}

export function isValidSubAccountId(v: unknown): v is GhlSubAccountId {
  return typeof v === "string" && SUB_ACCOUNTS.some((s) => s.id === v);
}

/** Parse a sub-account id from a query-string value. Falls back to the
 *  default when missing or invalid, so callers can pass straight through
 *  from `searchParams.get("subAccount")`. */
export function parseSubAccountId(
  raw: string | string[] | null | undefined,
  fallback: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): GhlSubAccountId {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isValidSubAccountId(v) ? v : fallback;
}

interface SubAccountEnv {
  pit: string;
  locationId: string;
}

/** Resolve env vars for one sub-account. Returns null when either var is
 *  missing — caller decides whether that's an error or "skip this account". */
export function getSubAccountEnv(id: GhlSubAccountId): SubAccountEnv | null {
  if (id === "peptide") {
    const pit = process.env.GHL_PIT;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!pit || !locationId) return null;
    return { pit, locationId };
  }
  if (id === "agency") {
    const pit = process.env.GHL_PIT_AGENCY;
    const locationId = process.env.GHL_LOCATION_ID_AGENCY;
    if (!pit || !locationId) return null;
    return { pit, locationId };
  }
  return null;
}

/** Sub-accounts with both env vars set. Discovery iterates this list. */
export function getConfiguredSubAccountIds(): GhlSubAccountId[] {
  return SUB_ACCOUNTS.map((s) => s.id).filter(
    (id) => getSubAccountEnv(id) !== null
  );
}

export function isAnyGhlConfigured(): boolean {
  return getConfiguredSubAccountIds().length > 0;
}
