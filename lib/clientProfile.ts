import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import { normalizeBrandName, brandsMatch } from "./payouts";
import { parseServiceCategory } from "./serviceCategory";
import { readUsers } from "./users";

// ---------------------------------------------------------------------------
// Client roster profile (Client Directory roster columns)
//
// One client_profile row per client, created lazily on first edit — absence
// means defaults (book 'agency', ads running, no chips), mirroring
// client_billing. client_team links clients to people from the admins table
// (roles 'media_buyer' | 'lead' | 'csm'). Strictly additive on top of the
// existing directory — nothing here touches billing math or Meta linking.
// ---------------------------------------------------------------------------

export type ClientBook = "agency" | "pepads";
// 'csm' (Client Success Manager) is its OWN role — grouped, counted, and
// labeled separately from media_buyer everywhere (pickers, filter cards,
// roster groups, Team-page attribution).
export type TeamRole = "media_buyer" | "lead" | "csm";
export const TEAM_ROLES: readonly TeamRole[] = ["media_buyer", "lead", "csm"];
export type ManualBillingStatus = "extended" | "paid" | "upcoming" | "paused";

export const BOOK_OPTIONS = [
  { value: "agency", label: "Agency Collective" },
  { value: "pepads", label: "PepAds" },
] as const;

export const STAGE_OPTIONS = [
  { value: "onboarding", label: "Onboarding" },
  { value: "launched", label: "Ads Launched" },
  { value: "warmup", label: "In Warm-up" },
  { value: "phase3", label: "Phase Three" },
  { value: "optimizing", label: "Optimizing" },
  { value: "scaling", label: "Scaling" },
] as const;

export const HEALTH_OPTIONS = [
  { value: "happy", label: "Happy" },
  { value: "mad", label: "Mad" },
  { value: "money", label: "Making Money" },
  { value: "struggling", label: "Struggling" },
  { value: "testing", label: "Need More Testing" },
] as const;

export const AD_PLATFORM_OPTIONS = [
  { value: "orange", label: "Orange Trail" },
  { value: "concept", label: "Concept" },
  { value: "personal", label: "Personal" },
] as const;

/**
 * Fixed roster service vocabulary (matches the roster prototype) — NOT the
 * /api/services invoice presets. Deal-import auto-fill maps free-form deal
 * service names onto these via mapDealServiceToRoster().
 */
export const SERVICE_OPTIONS = [
  { value: "meta", label: "Meta Ads" },
  { value: "tiktok", label: "TikTok Ads" },
  { value: "google", label: "Google Ads" },
  { value: "creatives", label: "Ad Creatives" },
  { value: "email", label: "Email & SMS" },
] as const;

export const MANUAL_BILLING_OPTIONS = [
  { value: "extended", label: "Extended" },
  { value: "paid", label: "Paid" },
  { value: "upcoming", label: "Upcoming" },
  { value: "paused", label: "Paused" },
] as const;

// Stage / health / ad-platform values are NOT gated to a static set — those
// vocabularies are admin-extensible (see sanitizeOpenStringArray +
// lib/adPlatformOptions.ts / lib/rosterOptions.ts).
const MANUAL_BILLING_VALUES = new Set<string>(MANUAL_BILLING_OPTIONS.map((o) => o.value));
const SERVICE_VALUES = new Set<string>(SERVICE_OPTIONS.map((o) => o.value));

/**
 * Map a free-form deal service name (invoice_services preset, e.g.
 * "Meta Ads Management", "Email Marketing & SMS") onto the fixed roster
 * vocabulary. Null when nothing matches — that service just isn't shown.
 */
export function mapDealServiceToRoster(name: string): string | null {
  const s = name.toLowerCase();
  if (/(meta|facebook|instagram)/.test(s)) return "meta";
  if (/tik\s*tok/.test(s)) return "tiktok";
  if (/(google|youtube)/.test(s)) return "google";
  if (/creative/.test(s)) return "creatives";
  if (/(email|sms|klaviyo)/.test(s)) return "email";
  return null;
}

export interface ClientProfile {
  userId: string;
  book: ClientBook;
  website: string | null;
  isTop: boolean;
  adsRunning: boolean; // Meta ads toggle
  tiktokAdsRunning: boolean; // TikTok ads toggle (defaults off)
  adPlatforms: string[]; // AD_PLATFORM_OPTIONS + custom ad_platform_options values
  stages: string[]; // STAGE_OPTIONS + custom roster_options values
  health: string[]; // HEALTH_OPTIONS + custom roster_options values
  services: string[]; // SERVICE_OPTIONS values (fixed roster vocabulary)
  perfFee: string | null; // manual override; null = derive from linked ad_accounts
  revThreshold: string | null;
  manualBilling: ManualBillingStatus[]; // pepads only
  manualNextRebill: string | null; // yyyy-mm-dd, pepads only
  manualMrrCents: number | null; // pepads only — manual Monthly MRR
  manualLtvCents: number | null; // pepads only — manual LTV
  rosterNotes: string | null; // inline quick note (Notes column)
  createdAt: string;
  updatedAt: string;
}

export interface ClientTeamMember {
  adminId: string;
  role: TeamRole;
  name: string;
  avatarPath: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Defensive JSON string[] parse — bad/legacy data degrades to []. */
function parseStringArray(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
    }
  } catch {
    // malformed — treat as empty
  }
  return [];
}

function serializeStringArray(values: string[]): string | null {
  const filtered = values.filter(Boolean);
  return filtered.length === 0 ? null : JSON.stringify(filtered);
}

/** Defaults used when a client has no client_profile row yet. */
export function defaultClientProfile(userId: string): ClientProfile {
  return {
    userId,
    book: "agency",
    website: null,
    isTop: false,
    adsRunning: true,
    tiktokAdsRunning: false,
    adPlatforms: [],
    stages: [],
    health: [],
    services: [],
    perfFee: null,
    revThreshold: null,
    manualBilling: [],
    manualNextRebill: null,
    manualMrrCents: null,
    manualLtvCents: null,
    rosterNotes: null,
    createdAt: "",
    updatedAt: "",
  };
}

function rowToProfile(row: Row): ClientProfile {
  const book = String(row.book ?? "agency");
  return {
    userId: String(row.user_id),
    book: book === "pepads" ? "pepads" : "agency",
    website: row.website != null ? String(row.website) : null,
    isTop: Number(row.is_top ?? 0) === 1,
    adsRunning: Number(row.ads_running ?? 1) === 1,
    tiktokAdsRunning: Number(row.tiktok_ads_running ?? 0) === 1,
    adPlatforms: parseStringArray(row.ad_platforms),
    stages: parseStringArray(row.stages),
    health: parseStringArray(row.health),
    services: parseStringArray(row.services),
    perfFee: row.perf_fee != null ? String(row.perf_fee) : null,
    revThreshold: row.rev_threshold != null ? String(row.rev_threshold) : null,
    manualBilling: parseStringArray(row.manual_billing).filter(
      (v): v is ManualBillingStatus => MANUAL_BILLING_VALUES.has(v)
    ),
    manualNextRebill:
      row.manual_next_rebill != null ? String(row.manual_next_rebill) : null,
    manualMrrCents: row.manual_mrr_cents != null ? Number(row.manual_mrr_cents) : null,
    manualLtvCents: row.manual_ltv_cents != null ? Number(row.manual_ltv_cents) : null,
    rosterNotes: row.roster_notes != null ? String(row.roster_notes) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

// ---------------------------------------------------------------------------
// Write-time sanitizers (route-level validation calls these)
// ---------------------------------------------------------------------------

const MAX_TEXT_LEN = 100;
const MAX_WEBSITE_LEN = 500;
const MAX_NOTES_LEN = 2000;
const MAX_MONEY_CENTS = 1_000_000_000_00; // $1B guard against typo'd magnitudes
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeEnumArray(values: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const s = String(v).trim();
    if (allowed.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Open-vocabulary chip array (ad platforms, stages, health). Unlike the fixed
 * enums, these vocabularies are admin-extensible (ad_platform_options /
 * roster_options), so values can't be gated against a static set — that would
 * silently drop a freshly added custom option, and re-validating against the
 * LIVE set would drop a still-tagged value whose option was later removed.
 * Instead: trim, drop empties, cap length/count, dedupe. The picker only ever
 * emits known slugs.
 */
function sanitizeOpenStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const s = String(v).trim().slice(0, MAX_TEXT_LEN);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 50) break;
  }
  return out;
}

/**
 * Services accept the 5 enum values directly, but also tolerate free-form
 * service NAMES (mapped via mapDealServiceToRoster) — so a stale client
 * bundle or an external caller sending "Meta Ads Management" still saves
 * `meta` instead of being silently dropped to an empty list.
 */
function sanitizeServiceValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const s = String(v).trim();
    if (!s) continue;
    const mapped = SERVICE_VALUES.has(s) ? s : mapDealServiceToRoster(s);
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function sanitizeText(value: unknown, maxLen: number): string | null {
  if (value == null) return null;
  const s = String(value).trim().slice(0, maxLen);
  return s || null;
}

/** null clears; otherwise a non-negative integer cents amount (capped). */
function sanitizeCents(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_MONEY_CENTS, Math.round(n));
}

export interface ClientProfileInput {
  book?: ClientBook;
  website?: string | null;
  isTop?: boolean;
  adsRunning?: boolean;
  tiktokAdsRunning?: boolean;
  adPlatforms?: string[];
  stages?: string[];
  health?: string[];
  services?: string[];
  perfFee?: string | null;
  revThreshold?: string | null;
  manualBilling?: string[];
  manualNextRebill?: string | null;
  manualMrrCents?: number | null;
  manualLtvCents?: number | null;
  rosterNotes?: string | null;
}

/**
 * Coerce an untrusted partial body into a safe ClientProfileInput. Unknown
 * enum values are dropped, text is trimmed/capped. Returns an error string
 * for the two fields that can't be silently coerced (book, date).
 */
export function sanitizeProfileInput(body: Record<string, unknown>): {
  input?: ClientProfileInput;
  error?: string;
} {
  const input: ClientProfileInput = {};

  if (body.book !== undefined) {
    if (body.book !== "agency" && body.book !== "pepads") {
      return { error: "book must be 'agency' or 'pepads'" };
    }
    input.book = body.book;
  }
  if (body.website !== undefined) input.website = sanitizeText(body.website, MAX_WEBSITE_LEN);
  if (body.isTop !== undefined) input.isTop = Boolean(body.isTop);
  if (body.adsRunning !== undefined) input.adsRunning = Boolean(body.adsRunning);
  if (body.tiktokAdsRunning !== undefined)
    input.tiktokAdsRunning = Boolean(body.tiktokAdsRunning);
  if (body.adPlatforms !== undefined)
    input.adPlatforms = sanitizeOpenStringArray(body.adPlatforms);
  if (body.stages !== undefined) input.stages = sanitizeOpenStringArray(body.stages);
  if (body.health !== undefined) input.health = sanitizeOpenStringArray(body.health);
  if (body.services !== undefined) input.services = sanitizeServiceValues(body.services);
  if (body.perfFee !== undefined) input.perfFee = sanitizeText(body.perfFee, MAX_TEXT_LEN);
  if (body.revThreshold !== undefined)
    input.revThreshold = sanitizeText(body.revThreshold, MAX_TEXT_LEN);
  if (body.manualBilling !== undefined)
    input.manualBilling = sanitizeEnumArray(body.manualBilling, MANUAL_BILLING_VALUES);
  if (body.manualNextRebill !== undefined) {
    const v = sanitizeText(body.manualNextRebill, 10);
    if (v !== null && !ISO_DATE_RE.test(v)) {
      return { error: "manualNextRebill must be yyyy-mm-dd" };
    }
    input.manualNextRebill = v;
  }
  if (body.manualMrrCents !== undefined)
    input.manualMrrCents = sanitizeCents(body.manualMrrCents);
  if (body.manualLtvCents !== undefined)
    input.manualLtvCents = sanitizeCents(body.manualLtvCents);
  if (body.rosterNotes !== undefined)
    input.rosterNotes = sanitizeText(body.rosterNotes, MAX_NOTES_LEN);

  return { input };
}

// ---------------------------------------------------------------------------
// DB access — profiles
// ---------------------------------------------------------------------------

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

export async function getClientProfile(userId: string): Promise<ClientProfile | null> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: "SELECT * FROM client_profile WHERE user_id = ?",
      args: [userId],
    });
    return result.rows[0] ? rowToProfile(result.rows[0]) : null;
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
}

/** All profiles keyed by userId. Table only has rows for edited clients. */
export async function getAllClientProfiles(): Promise<Map<string, ClientProfile>> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, ClientProfile>();
  try {
    const result = await db.execute("SELECT * FROM client_profile");
    for (const row of result.rows) {
      const p = rowToProfile(row);
      map.set(p.userId, p);
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
  return map;
}

/**
 * Upsert a client's roster profile. Creates the row on first edit, then
 * patches ONLY the provided fields — concurrent inline edits of different
 * columns don't clobber each other. Same two-statement pattern as
 * upsertClientBilling.
 */
export async function upsertClientProfile(
  userId: string,
  changes: ClientProfileInput
): Promise<void> {
  await ensureMigrated();
  const db = getDb();

  await db.execute({
    sql: `INSERT INTO client_profile (user_id) VALUES (?)
          ON CONFLICT(user_id) DO NOTHING`,
    args: [userId],
  });

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (col: string, val: string | number | null) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };

  if (changes.book !== undefined) set("book", changes.book);
  if (changes.website !== undefined) set("website", changes.website);
  if (changes.isTop !== undefined) set("is_top", changes.isTop ? 1 : 0);
  if (changes.adsRunning !== undefined) set("ads_running", changes.adsRunning ? 1 : 0);
  if (changes.tiktokAdsRunning !== undefined)
    set("tiktok_ads_running", changes.tiktokAdsRunning ? 1 : 0);
  if (changes.adPlatforms !== undefined)
    set("ad_platforms", serializeStringArray(changes.adPlatforms));
  if (changes.stages !== undefined) set("stages", serializeStringArray(changes.stages));
  if (changes.health !== undefined) set("health", serializeStringArray(changes.health));
  if (changes.services !== undefined)
    set("services", serializeStringArray(changes.services));
  if (changes.perfFee !== undefined) set("perf_fee", changes.perfFee);
  if (changes.revThreshold !== undefined) set("rev_threshold", changes.revThreshold);
  if (changes.manualBilling !== undefined)
    set("manual_billing", serializeStringArray(changes.manualBilling));
  if (changes.manualNextRebill !== undefined)
    set("manual_next_rebill", changes.manualNextRebill);
  if (changes.manualMrrCents !== undefined)
    set("manual_mrr_cents", changes.manualMrrCents);
  if (changes.manualLtvCents !== undefined)
    set("manual_ltv_cents", changes.manualLtvCents);
  if (changes.rosterNotes !== undefined) set("roster_notes", changes.rosterNotes);

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(userId);

  await db.execute({
    sql: `UPDATE client_profile SET ${fields.join(", ")} WHERE user_id = ?`,
    args,
  });
}

// ---------------------------------------------------------------------------
// DB access — team assignments
// ---------------------------------------------------------------------------

const MAX_TEAM_PER_ROLE = 20;

function rowToTeamMember(row: Row): ClientTeamMember | null {
  // LEFT JOIN admins — a null username means the admin was deleted; drop it.
  if (row.username == null) return null;
  const role = String(row.role);
  if (role !== "media_buyer" && role !== "lead" && role !== "csm") return null;
  return {
    adminId: String(row.admin_id),
    role,
    name:
      row.display_name != null && String(row.display_name).trim()
        ? String(row.display_name)
        : String(row.username),
    avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
  };
}

const TEAM_SELECT = `
  SELECT ct.user_id, ct.admin_id, ct.role, a.username, a.display_name, a.avatar_path
  FROM client_team ct
  LEFT JOIN admins a ON a.id = ct.admin_id
`;

/** All team assignments keyed by userId (deleted admins dropped). */
export async function getAllClientTeams(): Promise<Map<string, ClientTeamMember[]>> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, ClientTeamMember[]>();
  try {
    const result = await db.execute(`${TEAM_SELECT} ORDER BY ct.assigned_at`);
    for (const row of result.rows) {
      const member = rowToTeamMember(row);
      if (!member) continue;
      const userId = String(row.user_id);
      const list = map.get(userId) ?? [];
      list.push(member);
      map.set(userId, list);
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
  return map;
}

export async function getClientTeam(userId: string): Promise<ClientTeamMember[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `${TEAM_SELECT} WHERE ct.user_id = ? ORDER BY ct.assigned_at`,
      args: [userId],
    });
    return result.rows
      .map(rowToTeamMember)
      .filter((m): m is ClientTeamMember => m !== null);
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

/**
 * Replace the full assignment set for one (client, role) atomically —
 * the documented libSQL atomic-write pattern (db.batch). Other roles'
 * assignments are untouched.
 */
export async function setClientTeam(
  userId: string,
  role: TeamRole,
  adminIds: string[],
  assignedBy: string | null
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const unique = [...new Set(adminIds)].slice(0, MAX_TEAM_PER_ROLE);
  await db.batch(
    [
      {
        sql: "DELETE FROM client_team WHERE user_id = ? AND role = ?",
        args: [userId, role],
      },
      ...unique.map((adminId) => ({
        sql: `INSERT INTO client_team (id, user_id, admin_id, role, assigned_by)
              VALUES (?, ?, ?, ?, ?)`,
        args: [randomUUID(), userId, adminId, role, assignedBy] as (
          | string
          | null
        )[],
      })),
    ],
    "write"
  );
}

// ---------------------------------------------------------------------------
// Perf-fee derivation (pure)
// ---------------------------------------------------------------------------

function formatBpsPercent(bps: number): string {
  return String(bps / 100);
}

/**
 * Derive a display label for the ad-spend fee from a client's linked
 * ad_accounts: "2.5%" for one distinct fee, "2–5%" across several. Active
 * accounts only; null when the client has none (manual perfFee, when set,
 * always wins over this at display time).
 */
export function deriveAdSpendFeeLabel(
  accounts: Array<{ adSpendFeeBps: number; status: string }>
): string | null {
  const fees = [
    ...new Set(accounts.filter((a) => a.status === "active").map((a) => a.adSpendFeeBps)),
  ].sort((a, b) => a - b);
  if (fees.length === 0) return null;
  if (fees.length === 1) return `${formatBpsPercent(fees[0])}%`;
  return `${formatBpsPercent(fees[0])}–${formatBpsPercent(fees[fees.length - 1])}%`;
}

// ---------------------------------------------------------------------------
// Effective money values (pure) — PepAds (manual book) rows prefer the
// hand-entered amounts; Agency rows keep the payout-derived numbers. Used by
// the directory UI, the CSV export AND the Revenue Projection baseline so the
// summary card and the projection agree on what counts as recurring revenue.
// ---------------------------------------------------------------------------

interface MoneySource {
  profile: ClientProfile;
  payoutMrr: number;
  mrr: number; // legacy users.mrr (cents)
  totalRevenue: number;
}

export function effectiveMrrCents(c: MoneySource): number {
  if (c.profile.book === "pepads") {
    return c.profile.manualMrrCents ?? (c.payoutMrr > 0 ? c.payoutMrr : c.mrr);
  }
  return c.payoutMrr;
}

export function effectiveLtvCents(c: MoneySource): number {
  if (c.profile.book === "pepads") {
    return c.profile.manualLtvCents ?? c.totalRevenue;
  }
  return c.totalRevenue;
}

// ---------------------------------------------------------------------------
// Deal → profile auto-fill
// ---------------------------------------------------------------------------

interface DealAutofillSource {
  clientUserId: string | null;
  brandName: string | null;
  clientName: string;
  website: string | null;
  serviceCategory: string | null;
}

/**
 * Fill a directory client's roster profile (website + services) from a deal —
 * used when a payout is imported from that deal, and when a client is created
 * from a payout brand that traces back to a deal. Only fills fields that are
 * currently EMPTY: a manual edit is never overwritten. Non-blocking by
 * contract — callers wrap in try/catch and surface `warnings`.
 */
export async function autofillClientProfileFromDeal(
  deal: DealAutofillSource,
  opts?: { resolvedUserId?: string }
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const website = deal.website?.trim() || null;
  // Deal services are free-form preset names — map onto the fixed roster
  // vocabulary; names that don't map are simply not carried over.
  const services = [
    ...new Set(
      parseServiceCategory(deal.serviceCategory)
        .map(mapDealServiceToRoster)
        .filter((v): v is string => v !== null)
    ),
  ];
  if (!website && services.length === 0) return { warnings };

  // Resolve the target client: explicit id → deal link → brand match
  // (mirrors the directory's matchHistories priority: explicit payout_brand
  // first, then display name, exact before fuzzy).
  let userId = opts?.resolvedUserId ?? deal.clientUserId ?? null;
  if (!userId) {
    const brandSource = deal.brandName?.trim() || deal.clientName;
    const norm = normalizeBrandName(brandSource);
    if (!norm) {
      warnings.push("No directory client matched this deal — website/services were not auto-filled.");
      return { warnings };
    }
    const users = await readUsers();
    const exact = users.filter(
      (u) =>
        (u.payoutBrand && normalizeBrandName(u.payoutBrand) === norm) ||
        normalizeBrandName(u.displayName) === norm
    );
    if (exact.length === 1) {
      userId = exact[0].id;
    } else if (exact.length === 0) {
      const fuzzy = users.filter((u) => {
        const linkNorm = u.payoutBrand ? normalizeBrandName(u.payoutBrand) : "";
        const nameNorm = normalizeBrandName(u.displayName);
        return (
          (linkNorm && brandsMatch(linkNorm, norm)) ||
          (nameNorm && brandsMatch(nameNorm, norm))
        );
      });
      if (fuzzy.length === 1) {
        userId = fuzzy[0].id;
      } else if (fuzzy.length > 1) {
        warnings.push("Multiple directory clients matched this deal's brand — auto-fill skipped.");
        return { warnings };
      }
    } else {
      warnings.push("Multiple directory clients matched this deal's brand — auto-fill skipped.");
      return { warnings };
    }
  }

  if (!userId) {
    warnings.push("No directory client matched this deal — website/services were not auto-filled.");
    return { warnings };
  }

  const current = await getClientProfile(userId);
  const changes: ClientProfileInput = {};
  if (website && !(current?.website && current.website.trim())) {
    changes.website = website.slice(0, MAX_WEBSITE_LEN);
  }
  if (services.length > 0 && (!current || current.services.length === 0)) {
    changes.services = services;
  }
  if (Object.keys(changes).length === 0) return { warnings };

  await upsertClientProfile(userId, changes);
  return { warnings };
}
