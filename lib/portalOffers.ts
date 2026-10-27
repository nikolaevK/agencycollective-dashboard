import crypto from "crypto";
import type { Row } from "@libsql/client";
import { getDb, isUniqueViolation } from "./db";
import { findUsersByIds } from "./users";
import { readAdmins } from "./admins";
import { inWorkspaceScope, isExternalScope, workspaceScopeOf, type WorkspaceScope } from "./workspaces";
import { sendPushToAdmins } from "./pushNotifications";
import { updateAgencyConfig } from "./agencyConfig";
import {
  DEFAULT_OFFER_ACCENT,
  MAX_REQUESTS_PER_DAY,
  STARTER_OFFERS,
  isOfferCtaType,
  isOfferRequestStatus,
  normalizeOfferPage,
  offerPublishError,
  offerSlugBase,
  resolveOfferPage,
  type OfferCtaType,
  type OfferFields,
  type OfferHighlight,
  type OfferLink,
  type OfferPageOverrides,
  type OfferPageSettings,
  type OfferRequestInput,
  type OfferRequestStatus,
} from "./portalOfferRules";

/**
 * Portal "More from Agency Collective": the admin-managed catalog of our other
 * services, per-client view tracking, and the Request Info / Book a Call leads
 * clients file from it. Leads stay in the dashboard (Client Directory →
 * Cross-sell) and push a heads-up to admins; nothing is emailed.
 */

export interface PortalOffer extends OfferFields {
  id: string;
  slug: string;
  sortOrder: number;
  /** Public serve URLs (`?v=` busts the cache on replace); null = none. */
  logoUrl: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const OFFER_COLUMNS = `id, slug, title, tagline, category, body, highlights, badge, links, cta_type,
  cta_label, cta_url, accent, featured, active, sort_order, logo_version, cover_version, published_at,
  created_at, updated_at`;

function parseList<T>(raw: unknown): T[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export const OFFER_IMAGE_KINDS = ["logo", "cover"] as const;
export type OfferImageKind = (typeof OFFER_IMAGE_KINDS)[number] | "hero";
/** Owner id of the page-level images (the catalog header). */
export const PAGE_IMAGE_OWNER = "page";

function imageUrl(ownerId: string, kind: OfferImageKind, version: unknown): string | null {
  return version != null ? `/api/offers/images/${ownerId}/${kind}?v=${String(version)}` : null;
}

function rowToOffer(r: Row): PortalOffer {
  const id = String(r.id);
  const ctaType = String(r.cta_type);
  return {
    id,
    slug: String(r.slug),
    title: String(r.title),
    tagline: String(r.tagline ?? ""),
    category: String(r.category ?? ""),
    body: String(r.body ?? ""),
    highlights: parseList<OfferHighlight>(r.highlights),
    badge: r.badge != null ? String(r.badge) : null,
    links: parseList<OfferLink>(r.links),
    ctaType: isOfferCtaType(ctaType) ? ctaType : "request_info",
    ctaLabel: r.cta_label != null ? String(r.cta_label) : null,
    ctaUrl: r.cta_url != null ? String(r.cta_url) : null,
    accent: String(r.accent ?? DEFAULT_OFFER_ACCENT),
    featured: Number(r.featured) === 1,
    active: Number(r.active) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    logoUrl: imageUrl(id, "logo", r.logo_version),
    coverUrl: imageUrl(id, "cover", r.cover_version),
    publishedAt: r.published_at != null ? String(r.published_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function listOffers(opts: { activeOnly?: boolean } = {}): Promise<PortalOffer[]> {
  const result = await getDb().execute(
    `SELECT ${OFFER_COLUMNS} FROM portal_offers
     ${opts.activeOnly ? "WHERE active = 1" : ""}
     ORDER BY sort_order, created_at`
  );
  return result.rows.map(rowToOffer);
}

export async function getOffer(id: string): Promise<PortalOffer | null> {
  const result = await getDb().execute({
    sql: `SELECT ${OFFER_COLUMNS} FROM portal_offers WHERE id = ?`,
    args: [id],
  });
  return result.rows[0] ? rowToOffer(result.rows[0]) : null;
}

export async function getActiveOfferBySlug(slug: string): Promise<PortalOffer | null> {
  const result = await getDb().execute({
    sql: `SELECT ${OFFER_COLUMNS} FROM portal_offers WHERE slug = ? AND active = 1`,
    args: [slug],
  });
  return result.rows[0] ? rowToOffer(result.rows[0]) : null;
}

/**
 * One LIVE featured service (the catalog spotlight): a featured service going
 * live un-features the other live ones. A featured draft leaves the current
 * spotlight alone until it's published.
 */
function unfeatureOthers(id: string) {
  return { sql: "UPDATE portal_offers SET featured = 0 WHERE featured = 1 AND active = 1 AND id != ?", args: [id] };
}

function isSlugTaken(err: unknown): boolean {
  return isUniqueViolation(err) && /portal_offers\.slug/i.test(err instanceof Error ? err.message : String(err));
}

/** Insert under the first free `slug`, `slug-2`, … (the slug never changes after). */
async function insertOffer(f: OfferFields): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const base = offerSlugBase(f.title);
  for (let n = 1; n <= 50; n++) {
    try {
      const insert = {
        sql: `INSERT INTO portal_offers (id, slug, title, tagline, category, body, highlights, badge,
                links, cta_type, cta_label, cta_url, accent, featured, active, sort_order, published_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM portal_offers),
                CASE WHEN ? = 1 THEN datetime('now') END)`,
        args: [
          id,
          n === 1 ? base : `${base}-${n}`,
          f.title,
          f.tagline,
          f.category,
          f.body,
          JSON.stringify(f.highlights),
          f.badge,
          JSON.stringify(f.links),
          f.ctaType,
          f.ctaLabel,
          f.ctaUrl,
          f.accent,
          f.featured ? 1 : 0,
          f.active ? 1 : 0,
          f.active ? 1 : 0,
        ],
      };
      await db.batch(f.featured && f.active ? [insert, unfeatureOthers(id)] : [insert], "write");
      return id;
    } catch (err) {
      if (!isSlugTaken(err)) throw err;
    }
  }
  throw new Error("Could not find a free slug");
}

const EMPTY_FIELDS: OfferFields = {
  title: "",
  tagline: "",
  category: "",
  body: "",
  highlights: [],
  badge: null,
  links: [],
  ctaType: "request_info",
  ctaLabel: null,
  ctaUrl: null,
  accent: DEFAULT_OFFER_ACCENT,
  featured: false,
  active: false,
};

export class OfferValidationError extends Error {}

export async function createOffer(fields: Partial<OfferFields>): Promise<PortalOffer> {
  const f = { ...EMPTY_FIELDS, ...fields };
  const invalid = offerPublishError(f);
  if (invalid) throw new OfferValidationError(invalid);
  const id = await insertOffer(f);
  return (await getOffer(id))!;
}

/** The spec's launch list as hidden drafts — only into an empty catalog. */
export async function createStarterOffers(): Promise<number> {
  const count = await getDb().execute("SELECT COUNT(*) AS n FROM portal_offers");
  if (Number(count.rows[0]?.n ?? 0) > 0) return 0;
  for (const s of STARTER_OFFERS) await insertOffer({ ...EMPTY_FIELDS, ...s });
  return STARTER_OFFERS.length;
}

const FIELD_COLUMNS: Record<keyof OfferFields, string> = {
  title: "title",
  tagline: "tagline",
  category: "category",
  body: "body",
  highlights: "highlights",
  badge: "badge",
  links: "links",
  ctaType: "cta_type",
  ctaLabel: "cta_label",
  ctaUrl: "cta_url",
  accent: "accent",
  featured: "featured",
  active: "active",
};

/** Partial update; null when the offer doesn't exist. */
export async function updateOffer(
  id: string,
  changes: Partial<OfferFields>
): Promise<PortalOffer | null> {
  const current = await getOffer(id);
  if (!current) return null;
  const next = { ...current, ...changes };
  const invalid = offerPublishError(next);
  if (invalid) throw new OfferValidationError(invalid);

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(FIELD_COLUMNS) as [keyof OfferFields, string][]) {
    if (!(key in changes)) continue;
    const v = changes[key];
    sets.push(`${column} = ?`);
    args.push(
      Array.isArray(v) ? JSON.stringify(v) : typeof v === "boolean" ? (v ? 1 : 0) : (v as string | null)
    );
  }
  if (sets.length === 0) return current;
  // Going live (first publish or a restore) = "New" for clients again.
  // SQLite evaluates SET expressions against the row BEFORE the update.
  if (changes.active) sets.push("published_at = CASE WHEN active = 0 THEN datetime('now') ELSE published_at END");
  const update = {
    sql: `UPDATE portal_offers SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    args: [...args, id],
  };
  // Takes the spotlight when it is (or becomes) live AND featured.
  const takesSpotlight = next.featured && next.active && (changes.featured || changes.active);
  await getDb().batch(takesSpotlight ? [update, unfeatureOthers(id)] : [update], "write");
  return getOffer(id);
}

/** Views and images go with it; leads keep their offer-title snapshot. */
export async function deleteOffer(id: string): Promise<boolean> {
  const results = await getDb().batch(
    [
      { sql: "DELETE FROM portal_offers WHERE id = ?", args: [id] },
      { sql: "DELETE FROM portal_offer_images WHERE owner_id = ?", args: [id] },
      { sql: "DELETE FROM portal_offer_views WHERE offer_id = ?", args: [id] },
    ],
    "write"
  );
  return (results[0].rowsAffected ?? 0) > 0;
}

/**
 * Put `ids` first, in that order; services not listed follow in their current
 * order (so moving a few never scrambles the rest). Unknown ids are ignored.
 */
export async function reorderOffers(ids: string[]): Promise<void> {
  const current = (await listOffers()).map((o) => o.id);
  const listed = Array.from(new Set(ids)).filter((id) => current.includes(id));
  const order = [...listed, ...current.filter((id) => !listed.includes(id))];
  if (order.length === 0) return;
  await getDb().batch(
    order.map((id, i) => ({ sql: "UPDATE portal_offers SET sort_order = ? WHERE id = ?", args: [i, id] })),
    "write"
  );
}

/** The page has a 'hero' image; offers a 'logo' and a 'cover' (the kind names a column). */
export function isImageKindFor(ownerId: string, kind: string): kind is OfferImageKind {
  return ownerId === PAGE_IMAGE_OWNER ? kind === "hero" : (OFFER_IMAGE_KINDS as readonly string[]).includes(kind);
}

function assertImageKind(ownerId: string, kind: string): void {
  if (!isImageKindFor(ownerId, kind)) throw new Error(`Unknown image kind "${kind}"`);
}

/**
 * Store/replace an image under a new version (= its URL's `?v=`). Offers:
 * 'logo' | 'cover' (the offer's `{kind}_version` column moves in the same
 * batch); the page: 'hero' (its version lives on the image row only). false
 * when the offer doesn't exist.
 */
export async function setOfferImage(
  ownerId: string,
  kind: OfferImageKind,
  data: Buffer,
  contentType: string
): Promise<boolean> {
  assertImageKind(ownerId, kind);
  const version = Date.now();
  const upsert = {
    sql: `INSERT INTO portal_offer_images (owner_id, kind, content_type, version, data)
          SELECT ?, ?, ?, ?, ? WHERE ? = '${PAGE_IMAGE_OWNER}' OR EXISTS (SELECT 1 FROM portal_offers WHERE id = ?)
          ON CONFLICT(owner_id, kind) DO UPDATE SET
            content_type = excluded.content_type, version = excluded.version, data = excluded.data`,
    args: [ownerId, kind, contentType, version, data, ownerId, ownerId],
  };
  if (ownerId === PAGE_IMAGE_OWNER) {
    await getDb().execute(upsert);
    return true;
  }
  const results = await getDb().batch(
    [
      {
        sql: `UPDATE portal_offers SET ${kind}_version = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [version, ownerId],
      },
      upsert,
    ],
    "write"
  );
  return (results[0].rowsAffected ?? 0) > 0;
}

export async function clearOfferImage(ownerId: string, kind: OfferImageKind): Promise<void> {
  assertImageKind(ownerId, kind);
  const del = { sql: "DELETE FROM portal_offer_images WHERE owner_id = ? AND kind = ?", args: [ownerId, kind] };
  if (ownerId === PAGE_IMAGE_OWNER) {
    await getDb().execute(del);
    return;
  }
  await getDb().batch(
    [
      {
        sql: `UPDATE portal_offers SET ${kind}_version = NULL, updated_at = datetime('now') WHERE id = ?`,
        args: [ownerId],
      },
      del,
    ],
    "write"
  );
}

/** The image at exactly this version — an old or made-up `?v=` reads nothing. */
export async function getOfferImage(
  ownerId: string,
  kind: string,
  version: number
): Promise<{ data: Buffer; contentType: string } | null> {
  const result = await getDb().execute({
    sql: "SELECT content_type, data FROM portal_offer_images WHERE owner_id = ? AND kind = ? AND version = ?",
    args: [ownerId, kind, version],
  });
  const row = result.rows[0];
  if (!row || row.data == null) return null;
  const raw = row.data as ArrayBuffer | Uint8Array;
  return { data: Buffer.from(raw instanceof Uint8Array ? raw : new Uint8Array(raw)), contentType: String(row.content_type) };
}

// ---------------------------------------------------------------------------
// Page design: copy = OVERRIDES in one agency_config JSON value
// (blank/default fields aren't stored, so they follow the code defaults);
// the header image is an image row (owner 'page', kind 'hero').
// ---------------------------------------------------------------------------

const PAGE_KEY = "portal_offers_page";

function parseOverrides(raw: unknown): OfferPageOverrides {
  if (raw == null) return {};
  try {
    const parsed = normalizeOfferPage(JSON.parse(String(raw)));
    return parsed.ok ? parsed.value : {};
  } catch {
    return {}; // unreadable → defaults; the next save rewrites it
  }
}

export interface OfferPage {
  /** What clients see (overrides over the defaults). */
  settings: OfferPageSettings;
  /** Only the fields an admin changed (null = hidden) — the editor shows the rest as blank. */
  overrides: OfferPageOverrides;
  heroImageUrl: string | null;
}

/** Page design in one round trip. */
export async function getOfferPage(): Promise<OfferPage> {
  const result = await getDb().execute({
    sql: `SELECT (SELECT config_value FROM agency_config WHERE config_key = ?) AS page,
                 (SELECT version FROM portal_offer_images WHERE owner_id = ? AND kind = 'hero') AS hero`,
    args: [PAGE_KEY, PAGE_IMAGE_OWNER],
  });
  const row = result.rows[0];
  const overrides = parseOverrides(row?.page);
  return {
    settings: resolveOfferPage(overrides),
    overrides,
    heroImageUrl: imageUrl(PAGE_IMAGE_OWNER, "hero", row?.hero),
  };
}

/** Replace the copy overrides (already normalized). The header image is separate. */
export async function saveOfferPage(overrides: OfferPageOverrides): Promise<OfferPage> {
  if (Object.keys(overrides).length === 0) {
    await getDb().execute({ sql: "DELETE FROM agency_config WHERE config_key = ?", args: [PAGE_KEY] });
  } else {
    await updateAgencyConfig(PAGE_KEY, JSON.stringify(overrides));
  }
  return getOfferPage();
}

/** Merge field changes into the stored overrides ("" = back to the default, null = hidden). The API's write. */
export async function patchOfferPage(changes: OfferPageOverrides): Promise<OfferPage> {
  const { overrides } = await getOfferPage();
  const merged = normalizeOfferPage({ ...overrides, ...changes });
  return saveOfferPage(merged.ok ? merged.value : overrides);
}

/** Back to the default copy and no header image. */
export async function resetOfferPage(): Promise<OfferPage> {
  await getDb().batch(
    [
      { sql: "DELETE FROM portal_offer_images WHERE owner_id = ?", args: [PAGE_IMAGE_OWNER] },
      { sql: "DELETE FROM agency_config WHERE config_key = ?", args: [PAGE_KEY] },
    ],
    "write"
  );
  return getOfferPage();
}

// ---------------------------------------------------------------------------
// Engagement — what each client opened
// ---------------------------------------------------------------------------

/** A click on one of the service page's extra links (website, pricing, …). */
export async function recordOfferLinkClick(userId: string, offerId: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO portal_offer_views (user_id, offer_id, view_count, link_clicks) VALUES (?, ?, 0, 1)
          ON CONFLICT(user_id, offer_id) DO UPDATE SET
            link_clicks = link_clicks + 1, last_viewed_at = datetime('now')`,
    args: [userId, offerId],
  });
}

/** A reload within 30 s of the last counted view isn't another view. */
export async function recordOfferView(userId: string, offerId: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO portal_offer_views (user_id, offer_id) VALUES (?, ?)
          ON CONFLICT(user_id, offer_id) DO UPDATE SET
            view_count = view_count + 1, last_viewed_at = datetime('now')
          WHERE last_viewed_at <= datetime('now', '-30 seconds')`,
    args: [userId, offerId],
  });
}

export async function markCatalogSeen(userId: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO portal_offer_seen (user_id, seen_at) VALUES (?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET seen_at = excluded.seen_at`,
    args: [userId],
  });
}

/**
 * Sidebar state: show the tab only when something is live; "New" when a
 * service went live since the client last opened the catalog; the tab's
 * name from the page design. One round trip (the sidebar polls it).
 */
export async function getOfferNavState(
  userId: string
): Promise<{ visible: boolean; hasNew: boolean; label: string }> {
  const result = await getDb().execute({
    sql: `SELECT COUNT(*) AS live,
            SUM(CASE WHEN published_at > COALESCE(
              (SELECT seen_at FROM portal_offer_seen WHERE user_id = ?), '') THEN 1 ELSE 0 END) AS fresh,
            (SELECT config_value FROM agency_config WHERE config_key = ?) AS page
          FROM portal_offers WHERE active = 1`,
    args: [userId, PAGE_KEY],
  });
  const row = result.rows[0];
  return {
    visible: Number(row?.live ?? 0) > 0,
    hasNew: Number(row?.fresh ?? 0) > 0,
    label: resolveOfferPage(parseOverrides(row?.page)).navLabel,
  };
}

export interface OfferStats {
  viewers: number;
  views: number;
  linkClicks: number;
  openRequests: number;
  requests: number;
}

export const EMPTY_OFFER_STATS: Readonly<OfferStats> = { viewers: 0, views: 0, linkClicks: 0, openRequests: 0, requests: 0 };

/** Per-offer engagement totals for the admin catalog (offers with none are absent). */
export async function getOfferStats(): Promise<Map<string, OfferStats>> {
  const [views, requests] = await getDb().batch(
    [
      `SELECT offer_id, SUM(CASE WHEN view_count > 0 THEN 1 ELSE 0 END) AS viewers,
              SUM(view_count) AS views, SUM(link_clicks) AS link_clicks
       FROM portal_offer_views GROUP BY offer_id`,
      `SELECT offer_id, COUNT(*) AS requests,
              SUM(CASE WHEN status IN ('new', 'contacted') THEN 1 ELSE 0 END) AS open
       FROM portal_offer_requests GROUP BY offer_id`,
    ],
    "read"
  );
  const out = new Map<string, OfferStats>();
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { ...EMPTY_OFFER_STATS }));
    return s;
  };
  for (const r of views.rows) {
    const s = get(String(r.offer_id));
    s.viewers = Number(r.viewers);
    s.views = Number(r.views);
    s.linkClicks = Number(r.link_clicks);
  }
  for (const r of requests.rows) {
    const s = get(String(r.offer_id));
    s.requests = Number(r.requests);
    s.openRequests = Number(r.open);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface OfferRequest {
  id: string;
  offerId: string;
  offerTitle: string;
  userId: string;
  kind: OfferCtaType;
  contactEmail: string | null;
  contactPhone: string | null;
  message: string | null;
  status: OfferRequestStatus;
  note: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const REQUEST_COLUMNS = `r.id, r.offer_id, r.offer_title, r.user_id, r.kind, r.contact_email,
  r.contact_phone, r.message, r.status, r.note, r.updated_by_name, r.created_at, r.updated_at`;

function rowToRequest(r: Row): OfferRequest {
  const kind = String(r.kind);
  const status = String(r.status);
  return {
    id: String(r.id),
    offerId: String(r.offer_id),
    offerTitle: String(r.offer_title),
    userId: String(r.user_id),
    kind: isOfferCtaType(kind) ? kind : "request_info",
    contactEmail: r.contact_email != null ? String(r.contact_email) : null,
    contactPhone: r.contact_phone != null ? String(r.contact_phone) : null,
    message: r.message != null ? String(r.message) : null,
    status: isOfferRequestStatus(status) ? status : "new",
    note: r.note != null ? String(r.note) : null,
    updatedByName: r.updated_by_name != null ? String(r.updated_by_name) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export class OfferRequestLimitError extends Error {}

/**
 * File a client's lead. One OPEN request per client per offer (partial unique
 * index): a repeat returns the open one with `duplicate: true` and files
 * nothing — so no second notification either.
 */
export async function createOfferRequest(params: {
  userId: string;
  offer: Pick<PortalOffer, "id" | "title" | "ctaType">;
  input: OfferRequestInput;
}): Promise<{ request: OfferRequest; duplicate: boolean }> {
  const open = await getOpenRequest(params.userId, params.offer.id);
  if (open) return { request: open, duplicate: true };

  // The daily cap is checked INSIDE the insert, so parallel clicks can't pass it together.
  const id = crypto.randomUUID();
  const inserted = await getDb().execute({
    sql: `INSERT INTO portal_offer_requests
            (id, offer_id, offer_title, user_id, kind, contact_email, contact_phone, message)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM portal_offer_requests
                 WHERE user_id = ? AND created_at >= datetime('now', '-1 day')) < ?
          ON CONFLICT DO NOTHING`,
    args: [
      id,
      params.offer.id,
      params.offer.title,
      params.userId,
      params.offer.ctaType,
      params.input.contactEmail,
      params.input.contactPhone,
      params.input.message,
      params.userId,
      MAX_REQUESTS_PER_DAY,
    ],
  });
  const request = await getOpenRequest(params.userId, params.offer.id);
  // Nothing inserted and nothing open → the daily cap stopped it.
  if (!request) throw new OfferRequestLimitError("Too many requests today — please try again tomorrow");
  return { request, duplicate: (inserted.rowsAffected ?? 0) === 0 };
}

async function getOpenRequest(userId: string, offerId: string): Promise<OfferRequest | null> {
  const result = await getDb().execute({
    sql: `SELECT ${REQUEST_COLUMNS} FROM portal_offer_requests r
          WHERE r.user_id = ? AND r.offer_id = ? AND r.status IN ('new', 'contacted')`,
    args: [userId, offerId],
  });
  return result.rows[0] ? rowToRequest(result.rows[0]) : null;
}

/** The client's open requests, by offer id (portal "Requested" state). */
export async function getOpenRequestsByOffer(userId: string): Promise<Map<string, OfferRequest>> {
  const result = await getDb().execute({
    sql: `SELECT ${REQUEST_COLUMNS} FROM portal_offer_requests r
          WHERE r.user_id = ? AND r.status IN ('new', 'contacted')`,
    args: [userId],
  });
  return new Map(result.rows.map((row) => [String(row.offer_id), rowToRequest(row)]));
}

export interface OfferRequestListItem extends OfferRequest {
  clientName: string;
  workspace: string;
  /** How often this client opened the offer before/after asking. */
  viewCount: number;
}

/** Closed (won/lost) leads kept in the inbox — every OPEN lead is always listed. */
const CLOSED_REQUESTS_SHOWN = 300;

/**
 * Newest first: every open lead + the most recent closed ones, with the
 * client's CURRENT name + book (routes filter by scope). Clients are read
 * through the users metadata helper, never joined — a raw users join walks
 * the logo BLOB's overflow pages to reach `workspace`.
 */
export async function listOfferRequests(): Promise<OfferRequestListItem[]> {
  const result = await getDb().execute({
    sql: `SELECT ${REQUEST_COLUMNS}, v.view_count
          FROM portal_offer_requests r
          LEFT JOIN portal_offer_views v ON v.user_id = r.user_id AND v.offer_id = r.offer_id
          WHERE r.status IN ('new', 'contacted')
             OR r.id IN (SELECT id FROM portal_offer_requests WHERE status IN ('won', 'lost')
                         ORDER BY created_at DESC LIMIT ?)
          ORDER BY r.created_at DESC`,
    args: [CLOSED_REQUESTS_SHOWN],
  });
  const clients = new Map(
    (await findUsersByIds(Array.from(new Set(result.rows.map((row) => String(row.user_id)))))).map((u) => [u.id, u])
  );
  const out: OfferRequestListItem[] = [];
  for (const row of result.rows) {
    const client = clients.get(String(row.user_id));
    if (!client) continue; // deleted client (deleteUser removes their leads too)
    out.push({
      ...rowToRequest(row),
      clientName: client.displayName,
      workspace: client.workspace,
      viewCount: Number(row.view_count ?? 0),
    });
  }
  return out;
}

/** "New" leads the actor can see — the Client Directory tab badge. */
export async function countNewOfferRequests(scope: WorkspaceScope): Promise<number> {
  const result = await getDb().execute(
    "SELECT user_id FROM portal_offer_requests WHERE status = 'new'"
  );
  if (result.rows.length === 0) return 0;
  const userIds = result.rows.map((r) => String(r.user_id));
  const books = new Map((await findUsersByIds(Array.from(new Set(userIds)))).map((u) => [u.id, u.workspace]));
  return userIds.filter((id) => books.has(id) && inWorkspaceScope(scope, books.get(id)!)).length;
}

/**
 * Heads-up push for a new lead, only to admins who can open it: internal
 * (partner-book admins can't open Cross-sell), with the Client Directory
 * permission the deep link needs, and whose books include the client's (the
 * inbox filters by the client's book). Names the service, not the client.
 * Best-effort.
 */
export async function notifyOfferRequest(
  offer: Pick<PortalOffer, "title" | "ctaType">,
  requestId: string,
  clientWorkspace: string
): Promise<void> {
  try {
    const recipients = (await readAdmins())
      .filter((a) => {
        const scope = workspaceScopeOf(a);
        return (a.isSuper || a.permissions.users) && !isExternalScope(scope) && inWorkspaceScope(scope, clientWorkspace);
      })
      .map((a) => a.id);
    await sendPushToAdmins(new Set(recipients), {
      title: offer.ctaType === "book_call" ? "Client wants to book a call" : "New service request",
      body: `A client asked about ${offer.title} from the portal`,
      url: "/dashboard/users?tab=crossSell",
      tag: `offer-request-${requestId}`,
    });
  } catch (err) {
    console.error("[portalOffers] request push failed:", err);
  }
}

export async function getOfferRequest(id: string): Promise<OfferRequest | null> {
  const result = await getDb().execute({
    sql: `SELECT ${REQUEST_COLUMNS} FROM portal_offer_requests r WHERE r.id = ?`,
    args: [id],
  });
  return result.rows[0] ? rowToRequest(result.rows[0]) : null;
}

export class OfferRequestConflictError extends Error {}

/** Status/note change by an admin. Reopening while another open request exists → conflict. */
export async function updateOfferRequest(
  id: string,
  changes: { status?: OfferRequestStatus; note?: string | null },
  byName: string
): Promise<void> {
  const sets: string[] = ["updated_by_name = ?", "updated_at = datetime('now')"];
  const args: (string | null)[] = [byName];
  if (changes.status) {
    sets.push("status = ?");
    args.push(changes.status);
  }
  if (changes.note !== undefined) {
    sets.push("note = ?");
    args.push(changes.note);
  }
  try {
    await getDb().execute({
      sql: `UPDATE portal_offer_requests SET ${sets.join(", ")} WHERE id = ?`,
      args: [...args, id],
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new OfferRequestConflictError("This client already has an open request for this service");
    }
    throw err;
  }
}

export interface ClientOfferActivity {
  views: {
    offerId: string;
    title: string;
    viewCount: number;
    linkClicks: number;
    firstViewedAt: string;
    lastViewedAt: string;
  }[];
  requests: OfferRequest[];
}

/** What one client looked at and asked for — the call-prep view. */
export async function getClientOfferActivity(userId: string): Promise<ClientOfferActivity> {
  const [views, requests] = await getDb().batch(
    [
      {
        sql: `SELECT v.offer_id, o.title, v.view_count, v.link_clicks, v.first_viewed_at, v.last_viewed_at
              FROM portal_offer_views v JOIN portal_offers o ON o.id = v.offer_id
              WHERE v.user_id = ?
              ORDER BY v.last_viewed_at DESC`,
        args: [userId],
      },
      {
        sql: `SELECT ${REQUEST_COLUMNS} FROM portal_offer_requests r
              WHERE r.user_id = ? ORDER BY r.created_at DESC`,
        args: [userId],
      },
    ],
    "read"
  );
  return {
    views: views.rows.map((r) => ({
      offerId: String(r.offer_id),
      title: String(r.title),
      viewCount: Number(r.view_count),
      linkClicks: Number(r.link_clicks),
      firstViewedAt: String(r.first_viewed_at),
      lastViewedAt: String(r.last_viewed_at),
    })),
    requests: requests.rows.map(rowToRequest),
  };
}
