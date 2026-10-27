// Pure rules for the portal "More from Agency Collective" tab
// (lib/portalOffers.ts): offer + lead validation, slugs, CTA labels. No db
// imports — the admin editor and the portal reuse them client-side.

import { isValidEmail } from "./invoice/email";
import { sniffMatches } from "./clientAssetRules";

export const OFFER_CTA_TYPES = ["request_info", "book_call"] as const;
export type OfferCtaType = (typeof OFFER_CTA_TYPES)[number];

export const OFFER_REQUEST_STATUSES = ["new", "contacted", "won", "lost"] as const;
export type OfferRequestStatus = (typeof OFFER_REQUEST_STATUSES)[number];
/** Statuses that still hold the one-open-request-per-offer slot. */
export const OPEN_REQUEST_STATUSES: readonly OfferRequestStatus[] = ["new", "contacted"];

export const OFFER_REQUEST_STATUS_LABELS: Record<OfferRequestStatus, string> = {
  new: "New",
  contacted: "Contacted",
  won: "Won",
  lost: "Lost",
};

export const DEFAULT_OFFER_ACCENT = "#6d28d9";
/** Requests one client may file per rolling 24h (spam backstop). */
export const MAX_REQUESTS_PER_DAY = 10;

/** Field caps — the admin editor's inputs, the API docs and validation all use these. */
export const OFFER_LIMITS = {
  badge: 24,
  links: 4,
  linkLabel: 40,
  title: 80,
  tagline: 160,
  category: 40,
  body: 8000,
  ctaLabel: 40,
  highlights: 6,
  highlightStat: 24,
  highlightText: 140,
  message: 2000,
  phone: 40,
  url: 2000,
} as const;

/** A proof point: an optional big number ("$50M+") above a short line. */
export interface OfferHighlight {
  stat: string | null;
  text: string;
}

/** A secondary link on the service page (website, pricing, deck…). */
export interface OfferLink {
  label: string;
  url: string;
}

export interface OfferFields {
  title: string;
  tagline: string;
  category: string;
  body: string;
  highlights: OfferHighlight[];
  /** Small pill on the card, e.g. "New" or "Popular". */
  badge: string | null;
  links: OfferLink[];
  ctaType: OfferCtaType;
  ctaLabel: string | null;
  ctaUrl: string | null;
  accent: string;
  featured: boolean;
  active: boolean;
}

export function isOfferCtaType(v: unknown): v is OfferCtaType {
  return typeof v === "string" && (OFFER_CTA_TYPES as readonly string[]).includes(v);
}

export function isOfferRequestStatus(v: unknown): v is OfferRequestStatus {
  return typeof v === "string" && (OFFER_REQUEST_STATUSES as readonly string[]).includes(v);
}

export function ctaLabelOf(offer: { ctaType: OfferCtaType; ctaLabel: string | null }): string {
  return offer.ctaLabel || (offer.ctaType === "book_call" ? "Book a call" : "Request info");
}

/** "SuppAds — Supplements" → "suppads-supplements". Never empty. */
export function offerSlugBase(title: string): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "service";
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim() || v.trim().length > OFFER_LIMITS.url) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

class FieldError extends Error {}

/** Trimmed text; too long is an error (never silently cut — an agent or admin must know). */
function capped(v: unknown, max: number, label: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new FieldError(`${label} is too long (${s.length} characters, max ${max})`);
  return s;
}

function links(v: unknown): OfferLink[] {
  if (!Array.isArray(v)) return [];
  const out: OfferLink[] = [];
  for (const l of v) {
    if (!l || typeof l !== "object") continue;
    const rec = l as Record<string, unknown>;
    const label = capped(rec.label, OFFER_LIMITS.linkLabel, "Link label");
    const rawUrl = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!label && !rawUrl) continue;
    const url = httpsUrl(rawUrl);
    if (!url) throw new FieldError(`Link "${label || rawUrl.slice(0, 80)}" must be an https:// URL`);
    if (!label) throw new FieldError(`Give the link ${url} a label`);
    out.push({ label, url });
  }
  if (out.length > OFFER_LIMITS.links) throw new FieldError(`At most ${OFFER_LIMITS.links} links`);
  return out;
}

function highlights(v: unknown): OfferHighlight[] {
  if (!Array.isArray(v)) return [];
  const out: OfferHighlight[] = [];
  for (const h of v) {
    if (!h || typeof h !== "object") continue;
    const rec = h as Record<string, unknown>;
    const line = capped(rec.text, OFFER_LIMITS.highlightText, "Proof point");
    if (!line) continue;
    out.push({ stat: capped(rec.stat, OFFER_LIMITS.highlightStat, "Proof point number") || null, text: line });
  }
  if (out.length > OFFER_LIMITS.highlights) throw new FieldError(`At most ${OFFER_LIMITS.highlights} proof points`);
  return out;
}

/**
 * Validate an offer write. `partial` (PATCH) only checks and returns the
 * fields present; a full write (create) fills defaults. Errors are
 * human-readable — the editor shows them as-is. Over-long text and too many
 * proof points/links are errors, never trimmed away.
 */
export function normalizeOfferFields(
  raw: unknown,
  partial: boolean
): { ok: true; value: Partial<OfferFields> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const b = raw as Record<string, unknown>;
  const has = (k: string) => !partial || k in b;
  const v: Partial<OfferFields> = {};

  try {
    if (has("title")) {
      const title = capped(b.title, OFFER_LIMITS.title, "Title");
      if (!title) return { ok: false, error: "Title is required" };
      v.title = title;
    }
    if (has("tagline")) v.tagline = capped(b.tagline, OFFER_LIMITS.tagline, "One-liner");
    if (has("category")) v.category = capped(b.category, OFFER_LIMITS.category, "Category");
    if (has("body")) v.body = capped(b.body, OFFER_LIMITS.body, "Full pitch");
    if (has("highlights")) v.highlights = highlights(b.highlights);
    if (has("badge")) v.badge = capped(b.badge, OFFER_LIMITS.badge, "Badge") || null;
    if (has("links")) v.links = links(b.links);
    if (has("ctaLabel")) v.ctaLabel = capped(b.ctaLabel, OFFER_LIMITS.ctaLabel, "Button text") || null;
  } catch (err) {
    if (err instanceof FieldError) return { ok: false, error: err.message };
    throw err;
  }
  if (has("ctaType")) {
    const t = b.ctaType ?? "request_info";
    if (!isOfferCtaType(t)) return { ok: false, error: "Unknown button type" };
    v.ctaType = t;
  }
  if (has("ctaUrl")) {
    const hasValue = typeof b.ctaUrl === "string" && b.ctaUrl.trim() !== "";
    v.ctaUrl = httpsUrl(b.ctaUrl);
    if (hasValue && !v.ctaUrl) return { ok: false, error: "Booking link must be an https:// URL" };
  }
  if (has("accent")) {
    const a = typeof b.accent === "string" ? b.accent.trim() : "";
    if (a && !/^#[0-9a-f]{6}$/i.test(a)) return { ok: false, error: "Accent must be a #rrggbb color" };
    v.accent = (a || DEFAULT_OFFER_ACCENT).toLowerCase();
  }
  if (has("featured")) v.featured = b.featured === true;
  if (has("active")) v.active = b.active === true;
  return { ok: true, value: v };
}

/** A Book a Call offer needs its booking link before clients can see it. */
export function offerPublishError(o: Pick<OfferFields, "ctaType" | "ctaUrl" | "active">): string | null {
  if (o.active && o.ctaType === "book_call" && !o.ctaUrl) {
    return "Add a booking link before showing a Book a call service";
  }
  return null;
}

/** Live = clients see it; Draft = never published; Retired = was live, taken down. */
export type OfferLifecycle = "live" | "draft" | "retired";
export function offerLifecycle(o: { active: boolean; publishedAt: string | null }): OfferLifecycle {
  return o.active ? "live" : o.publishedAt ? "retired" : "draft";
}

/** Image caps: a service's logo is small; covers and the page header are wide photos. */
export const OFFER_IMAGE_MAX_BYTES = { logo: 1024 * 1024, cover: 2 * 1024 * 1024, hero: 2 * 1024 * 1024 } as const;
const OFFER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** The image's real type from its bytes (PNG / JPEG / WebP only — never the declared type), else null. */
export function detectOfferImageType(data: Uint8Array): (typeof OFFER_IMAGE_TYPES)[number] | null {
  return OFFER_IMAGE_TYPES.find((t) => sniffMatches(t, data.subarray(0, 16))) ?? null;
}

// ---------------------------------------------------------------------------
// Page design — every client-facing word outside the service cards. Stored as
// OVERRIDES only (one JSON value): a blank field — or one equal to its
// default — isn't stored, so it follows DEFAULT_OFFER_PAGE even when the
// defaults change later. The optional elements (HIDEABLE_OFFER_PAGE_FIELDS)
// can also be switched off: stored as null, shown as nothing. "{service}" is
// replaced with the service's title wherever it appears.
// ---------------------------------------------------------------------------

export interface OfferPageSettings {
  navLabel: string;
  heroEyebrow: string;
  heroTitle: string;
  /** Second line of the title, in the primary color (like the Welcome Kit). */
  heroTitleHighlight: string;
  heroSubtitle: string;
  featuredLabel: string;
  learnMoreLabel: string;
  allFilterLabel: string;
  requestedBadge: string;
  highlightsHeading: string;
  exploreHeading: string;
  ctaEyebrow: string;
  ctaHeading: string;
  ctaBodyRequest: string;
  ctaBodyBooking: string;
  ctaFootnote: string;
  formIntro: string;
  formEmailLabel: string;
  formPhoneLabel: string;
  formMessageLabel: string;
  formMessagePlaceholder: string;
  formSubmit: string;
  requestSentLabel: string;
  requestSuccess: string;
  bookingSuccess: string;
  bookingSuccessBody: string;
  bookingLinkLabel: string;
  emptyText: string;
}

export const DEFAULT_OFFER_PAGE: OfferPageSettings = {
  navLabel: "More from Agency Collective",
  heroEyebrow: "The Agency Collective family",
  heroTitle: "More from",
  heroTitleHighlight: "Agency Collective.",
  heroSubtitle:
    "Specialist agencies, platforms and partners from the same team behind your account. Take a look around — asking about any of them is free and there's no commitment.",
  featuredLabel: "Featured",
  learnMoreLabel: "Learn more",
  allFilterLabel: "All",
  requestedBadge: "Requested",
  highlightsHeading: "Why brands choose {service}",
  exploreHeading: "Explore more",
  ctaEyebrow: "Interested?",
  ctaHeading: "Talk to us about {service}",
  ctaBodyRequest: "Send a quick request and your Agency Collective team will follow up with the details.",
  ctaBodyBooking: "Pick a time that suits you — the call is free and there's no commitment.",
  ctaFootnote: "No commitment. Requests go straight to your Agency Collective team.",
  formIntro: "We'll reach out with details. Everything below is optional.",
  formEmailLabel: "Email",
  formPhoneLabel: "Phone",
  formMessageLabel: "Anything we should know?",
  formMessagePlaceholder: "Goals, timing, questions…",
  formSubmit: "Send request",
  requestSentLabel: "Request sent",
  requestSuccess: "Your team will be in touch shortly.",
  bookingSuccess: "We've let your team know",
  bookingSuccessBody: "Haven't picked a time yet? The booking page is one click away.",
  bookingLinkLabel: "Open booking page",
  emptyText: "Nothing to show yet — check back soon.",
};

const SHORT = 40;
const LINE = 120;
const PARAGRAPH = 300;
/** Max length per field — the editor's inputs use the same caps, so nothing is cut on save. */
export const OFFER_PAGE_LIMITS: Record<keyof OfferPageSettings, number> = {
  navLabel: SHORT,
  heroEyebrow: 60,
  heroTitle: 80,
  heroTitleHighlight: 80,
  heroSubtitle: 400,
  featuredLabel: SHORT,
  learnMoreLabel: SHORT,
  allFilterLabel: SHORT,
  requestedBadge: SHORT,
  highlightsHeading: LINE,
  exploreHeading: LINE,
  ctaEyebrow: SHORT,
  ctaHeading: LINE,
  ctaBodyRequest: PARAGRAPH,
  ctaBodyBooking: PARAGRAPH,
  ctaFootnote: PARAGRAPH,
  formIntro: PARAGRAPH,
  formEmailLabel: SHORT,
  formPhoneLabel: SHORT,
  formMessageLabel: LINE,
  formMessagePlaceholder: LINE,
  formSubmit: SHORT,
  requestSentLabel: SHORT,
  requestSuccess: PARAGRAPH,
  bookingSuccess: LINE,
  bookingSuccessBody: PARAGRAPH,
  bookingLinkLabel: SHORT,
  emptyText: PARAGRAPH,
};

/** Optional page elements an admin may hide (their render sites skip an empty value). */
export const HIDEABLE_OFFER_PAGE_FIELDS: readonly (keyof OfferPageSettings)[] = [
  "heroEyebrow",
  "heroTitleHighlight",
  "heroSubtitle",
  "ctaEyebrow",
  "ctaFootnote",
];

/** What's stored: a custom text, or null = hidden (hideable fields only). Absent = default. */
export type OfferPageOverrides = { [K in keyof OfferPageSettings]?: string | null };

/**
 * Validate a page-design write (or a stored value) into the overrides worth
 * storing: blank and default-equal fields are dropped, null hides a hideable
 * field (ignored elsewhere), unknown keys (e.g. a retired setting still in a
 * stored value) are ignored.
 */
export function normalizeOfferPage(
  raw: unknown
): { ok: true; value: OfferPageOverrides } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: OfferPageOverrides = {};
  for (const key of Object.keys(DEFAULT_OFFER_PAGE) as (keyof OfferPageSettings)[]) {
    if (b[key] === null && HIDEABLE_OFFER_PAGE_FIELDS.includes(key)) {
      out[key] = null;
      continue;
    }
    const v = text(b[key], OFFER_PAGE_LIMITS[key]);
    if (v && v !== DEFAULT_OFFER_PAGE[key]) out[key] = v;
  }
  return { ok: true, value: out };
}

/** Overrides over the defaults — what clients see (a hidden field is ""). */
export function resolveOfferPage(overrides: OfferPageOverrides): OfferPageSettings {
  const page = { ...DEFAULT_OFFER_PAGE };
  for (const key of Object.keys(page) as (keyof OfferPageSettings)[]) {
    const v = overrides[key];
    if (v === null) page[key] = "";
    else if (v) page[key] = v;
  }
  return page;
}

/**
 * Validate a page-design PATCH (the API's merge-style write): known fields
 * only; a string sets that text ("" = back to the default); null hides a
 * hideable element. Over-long text is an error, never cut.
 */
export function validateOfferPagePatch(
  raw: unknown
): { ok: true; value: OfferPageOverrides } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Send an object of page fields" };
  }
  const out: OfferPageOverrides = {};
  for (const [field, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(field in DEFAULT_OFFER_PAGE)) return { ok: false, error: `Unknown page field "${field}"` };
    const key = field as keyof OfferPageSettings;
    if (v === null) {
      if (!HIDEABLE_OFFER_PAGE_FIELDS.includes(key)) {
        return { ok: false, error: `${key} can't be hidden — send "" to restore its default` };
      }
      out[key] = null;
    } else if (typeof v === "string") {
      if (v.trim().length > OFFER_PAGE_LIMITS[key]) {
        return { ok: false, error: `${key} is too long (max ${OFFER_PAGE_LIMITS[key]} characters)` };
      }
      out[key] = v;
    } else {
      return { ok: false, error: `${key} must be a string, or null to hide it` };
    }
  }
  return { ok: true, value: out };
}

/** Fill "{service}" with the service's title. */
export function withService(template: string, title: string): string {
  return template.replace(/\{service\}/g, title);
}

export interface OfferRequestInput {
  contactEmail: string | null;
  contactPhone: string | null;
  message: string | null;
}

/**
 * An address safe to put behind `mailto:` — the shared EMAIL_RE allows
 * `? & = % # /`, which would let a client pre-fill cc/body in an admin's mail
 * app.
 */
export function isPlainEmail(v: string): boolean {
  return isValidEmail(v) && !/[?&=%#/]/.test(v);
}

/**
 * A client's Request Info form. Contact details are optional — the lead is
 * tied to the client's account either way. A typed email must be valid; the
 * one on file is only used when it is (so a bad stored address never blocks
 * a request, e.g. a Book a call that already opened the booking page).
 */
export function normalizeOfferRequest(
  raw: unknown,
  emailOnFile: string | null
): { ok: true; value: OfferRequestInput } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const typed = text(b.contactEmail, 254);
  if (typed && !isPlainEmail(typed)) return { ok: false, error: "Please enter a valid email" };
  const onFile = (emailOnFile ?? "").trim();
  const email = typed || (isPlainEmail(onFile) ? onFile : "");
  const phone = text(b.contactPhone, OFFER_LIMITS.phone);
  return {
    ok: true,
    value: {
      contactEmail: email || null,
      contactPhone: phone || null,
      message: text(b.message, OFFER_LIMITS.message) || null,
    },
  };
}

/** The spec's launch list — created as hidden drafts (titles only; pitches, logos and links are filled in by an admin). */
export const STARTER_OFFERS: ReadonlyArray<{ title: string; category: string }> = [
  { title: "SuppAds", category: "Agencies" },
  { title: "BeautyAds", category: "Agencies" },
  { title: "TeleAds", category: "Agencies" },
  { title: "RxAds", category: "Agencies" },
  { title: "CasinoAds", category: "Agencies" },
  { title: "SubscriptionAds", category: "Agencies" },
  { title: "EcomPartnerships", category: "Agencies" },
  { title: "Peptide Website & CRM", category: "Website & CRM" },
  { title: "Peptide Payments", category: "Payments" },
  { title: "3PL Select", category: "Fulfillment" },
  { title: "AdRoster", category: "Partners" },
];
