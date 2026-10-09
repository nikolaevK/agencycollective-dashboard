// ---------------------------------------------------------------------------
// Client onboarding questionnaire — the PURE half (no db imports): option
// vocabularies, the answer shape, server-side normalization, the progress
// count and the break-even math. Shared by the portal form, the admin read
// view and lib/clientOnboarding.ts (persistence).
//
// Money is integer CENTS, percentages are BASIS POINTS (codebase convention).
// Choice answers are stored as stable slugs; labels live only here, so a
// label can be reworded without touching stored rows.
// ---------------------------------------------------------------------------

export interface Option {
  value: string;
  label: string;
}

export const SELLS_OPTIONS: Option[] = [
  { value: "telehealth", label: "Telehealth" },
  { value: "supplements", label: "Supplements" },
  { value: "peptides", label: "Peptides (RUO)" },
  { value: "beauty", label: "Beauty / skincare" },
  { value: "subscription", label: "Subscription" },
  { value: "other_ecom", label: "Other e-commerce" },
];

export const CHANNEL_NONE = "none";
export const CHANNEL_OPTIONS: Option[] = [
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
  { value: "email_sms", label: "Email / SMS" },
  { value: "affiliates", label: "Affiliates / influencers" },
  { value: CHANNEL_NONE, label: "Nothing yet" },
];

export const REVENUE_OPTIONS: Option[] = [
  { value: "pre_launch", label: "Pre-launch" },
  { value: "under_10k", label: "Under $10k" },
  { value: "10k_50k", label: "$10k–$50k" },
  { value: "50k_100k", label: "$50k–$100k" },
  { value: "100k_250k", label: "$100k–$250k" },
  { value: "250k_500k", label: "$250k–$500k" },
  { value: "500k_1m", label: "$500k–$1M" },
  { value: "1m_plus", label: "$1M+" },
];

export const GOAL_OPTIONS: Option[] = [
  { value: "scale", label: "Scale revenue" },
  { value: "profit", label: "Hit a profit / ROAS target" },
  { value: "launch", label: "Launch a new product" },
  { value: "subscribers", label: "Grow subscribers" },
  { value: "fix_tracking", label: "Fix tracking and accounts" },
];

export const REPEAT_OPTIONS: Option[] = [
  { value: "one_time", label: "Mostly one-time" },
  { value: "some_repeat", label: "Some repeat buyers" },
  { value: "subscription", label: "Subscription or refills" },
];

export const STORE_OPTIONS: Option[] = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "other", label: "Other / custom" },
  { value: "not_sure", label: "Not sure" },
];

export const WEBSITE_MANAGER_OPTIONS: Option[] = [
  { value: "in_house", label: "In-house developer" },
  { value: "agency", label: "Agency or freelancer" },
  { value: "ourselves", label: "We do it ourselves" },
  { value: "no_one", label: "No one right now" },
];

export const ACCESS_PLATFORMS: (Option & { hint: string })[] = [
  { value: "meta", label: "Meta", hint: "Facebook & Instagram ads" },
  { value: "google", label: "Google", hint: "Ads, Analytics, Tag Manager" },
  { value: "tiktok", label: "TikTok", hint: "Ads account and pixel" },
  { value: "email", label: "Email / SMS", hint: "Klaviyo, Attentive, Postscript…" },
  { value: "tracking", label: "Tracking", hint: "Triple Whale, Northbeam…" },
];

export const ACCESS_STATUSES: Option[] = [
  { value: "using", label: "Using it" },
  { value: "not_using", label: "Not using" },
  { value: "setup", label: "Set it up for us" },
];

// ── Answer shape ───────────────────────────────────────────────────────────

export interface OnboardingAnswers {
  // 1 · The brand
  brandName: string;
  website: string;
  sells: string[];
  heroProduct: string;
  mainContact: string;
  adApprover: string;
  // 2 · Performance and goals
  monthlyRevenue: string | null;
  adSpendNowCents: number | null;
  channels: string[];
  roasNow: string;
  adSpendStartCents: number | null;
  adSpend90dCents: number | null;
  primaryGoal: string | null;
  target: string;
  win90d: string;
  // 3 · Cost per order
  aovCents: number | null;
  cogsCents: number | null;
  shippingCents: number | null;
  fulfillmentCents: number | null;
  processingBps: number | null;
  otherCents: number | null;
  refundsBps: number | null;
  repeatPurchase: string | null;
  // 4 · Platforms & access
  storePlatform: string | null;
  access: Record<string, string>;
  accessContact: string;
  websiteManager: string | null;
  assetsUrl: string;
  // 5 · Anything else
  notes: string;
}

export type OnboardingStatus = "draft" | "submitted";

export function emptyAnswers(): OnboardingAnswers {
  return {
    brandName: "",
    website: "",
    sells: [],
    heroProduct: "",
    mainContact: "",
    adApprover: "",
    monthlyRevenue: null,
    adSpendNowCents: null,
    channels: [],
    roasNow: "",
    adSpendStartCents: null,
    adSpend90dCents: null,
    primaryGoal: null,
    target: "",
    win90d: "",
    aovCents: null,
    cogsCents: null,
    shippingCents: null,
    fulfillmentCents: null,
    processingBps: null,
    otherCents: null,
    refundsBps: null,
    repeatPurchase: null,
    storePlatform: null,
    access: {},
    accessContact: "",
    websiteManager: null,
    assetsUrl: "",
    notes: "",
  };
}

// ── Normalization (server side — every write goes through this) ──────────

export const TEXT_MAX = 300;
export const URL_MAX = 1000;
export const NOTES_MAX = 5000;
/** $1B — anything above is a typo, not a budget. */
const MONEY_MAX_CENTS = 100_000_000_000;

const TEXT_FIELDS = [
  "brandName",
  "heroProduct",
  "mainContact",
  "adApprover",
  "roasNow",
  "target",
  "win90d",
  "accessContact",
] as const;
const URL_FIELDS = ["website", "assetsUrl"] as const;
const CENTS_FIELDS = [
  "adSpendNowCents",
  "adSpendStartCents",
  "adSpend90dCents",
  "aovCents",
  "cogsCents",
  "shippingCents",
  "fulfillmentCents",
  "otherCents",
] as const;
const BPS_FIELDS = ["processingBps", "refundsBps"] as const;
const CHOICE_FIELDS = {
  monthlyRevenue: REVENUE_OPTIONS,
  primaryGoal: GOAL_OPTIONS,
  repeatPurchase: REPEAT_OPTIONS,
  storePlatform: STORE_OPTIONS,
  websiteManager: WEBSITE_MANAGER_OPTIONS,
} as const;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function choice(v: unknown, options: Option[]): string | null {
  return typeof v === "string" && options.some((o) => o.value === v) ? v : null;
}

function multi(v: unknown, options: Option[]): string[] {
  if (!Array.isArray(v)) return [];
  const allowed = new Set(options.map((o) => o.value));
  // Keep the vocabulary's order, drop unknowns and duplicates.
  const picked = new Set(v.filter((x): x is string => typeof x === "string" && allowed.has(x)));
  return options.map((o) => o.value).filter((x) => picked.has(x));
}

function intInRange(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 && n <= max ? n : null;
}

/** Coerce an untrusted body into a well-formed answer set (never throws). */
export function normalizeOnboardingAnswers(raw: unknown): OnboardingAnswers {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = emptyAnswers();
  for (const k of TEXT_FIELDS) out[k] = text(src[k], TEXT_MAX);
  for (const k of URL_FIELDS) out[k] = text(src[k], URL_MAX);
  out.notes = text(src.notes, NOTES_MAX);
  for (const k of CENTS_FIELDS) out[k] = intInRange(src[k], MONEY_MAX_CENTS);
  for (const k of BPS_FIELDS) out[k] = intInRange(src[k], 10_000);
  for (const [k, options] of Object.entries(CHOICE_FIELDS)) {
    (out as unknown as Record<string, string | null>)[k] = choice(src[k], options);
  }
  out.sells = multi(src.sells, SELLS_OPTIONS);
  const channels = multi(src.channels, CHANNEL_OPTIONS);
  // "Nothing yet" is exclusive — a real channel wins over a stale tick.
  out.channels =
    channels.length > 1 ? channels.filter((c) => c !== CHANNEL_NONE) : channels;
  const access = (src.access && typeof src.access === "object" ? src.access : {}) as Record<string, unknown>;
  for (const p of ACCESS_PLATFORMS) {
    const status = choice(access[p.value], ACCESS_STATUSES);
    if (status) out.access[p.value] = status;
  }
  return out;
}

// ── Sections + progress ────────────────────────────────────────────────────

export interface QuestionDef {
  key: string;
  label: string;
  answered: (a: OnboardingAnswers) => boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  heading: string;
  why: string;
  questions: QuestionDef[];
}

const has = (v: string | null) => Boolean(v && v.trim());
const num = (v: number | null) => v != null;

function q(key: keyof OnboardingAnswers, label: string): QuestionDef {
  return {
    key,
    label,
    answered: (a) => {
      const v = a[key];
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "number") return true;
      return typeof v === "string" ? has(v) : false;
    },
  };
}

export const ONBOARDING_SECTIONS: SectionDef[] = [
  {
    id: "brand",
    title: "The brand",
    heading: "The brand",
    why: "Who you are and who we talk to.",
    questions: [
      q("brandName", "Brand name"),
      q("website", "Website"),
      q("sells", "What you sell"),
      q("heroProduct", "Main product to push"),
      q("mainContact", "Main point of contact"),
      q("adApprover", "Who approves ads"),
    ],
  },
  {
    id: "goals",
    title: "Performance and goals",
    heading: "Where you are, where you want to go",
    why: "A quick read on your numbers today and what you want to spend.",
    questions: [
      q("monthlyRevenue", "Monthly revenue now"),
      q("adSpendNowCents", "Monthly ad spend now"),
      q("channels", "Channels running now"),
      q("roasNow", "Current ROAS / MER"),
      q("adSpendStartCents", "Starting monthly ad spend"),
      q("adSpend90dCents", "Monthly ad spend in 90 days"),
      q("primaryGoal", "Number one goal"),
      q("target", "ROAS / CPA target"),
      q("win90d", "90-day win"),
    ],
  },
  {
    id: "costs",
    title: "Cost per order",
    heading: "Cost per order",
    why: "Per order, not per unit. Your best guess is fine. We use these to work out the ROAS you need just to break even.",
    questions: [
      q("aovCents", "Average order value"),
      q("cogsCents", "Product cost (COGS)"),
      q("shippingCents", "Shipping cost"),
      q("fulfillmentCents", "Fulfillment / 3PL"),
      q("processingBps", "Payment processing"),
      q("otherCents", "Other per-order costs"),
      q("refundsBps", "Refunds and chargebacks"),
      q("repeatPurchase", "Repeat purchases"),
    ],
  },
  {
    id: "access",
    title: "Platforms & access",
    heading: "Platforms & access",
    why: "Just tell us what you use. We'll send exact invite steps after this. You add us as a partner or user, so you keep ownership of everything.",
    questions: [
      q("storePlatform", "Store platform"),
      ...ACCESS_PLATFORMS.map((p) => ({
        key: `access.${p.value}`,
        label: p.label,
        answered: (a: OnboardingAnswers) => Boolean(a.access[p.value]),
      })),
      q("accessContact", "Who can give us access"),
      q("websiteManager", "Website managed by"),
      q("assetsUrl", "Brand assets folder"),
    ],
  },
  {
    id: "notes",
    title: "Anything else",
    heading: "Anything else",
    why: "",
    questions: [q("notes", "Anything we should know")],
  },
];

export const TOTAL_QUESTIONS = ONBOARDING_SECTIONS.reduce(
  (n, s) => n + s.questions.length,
  0
);

export function countAnswered(a: OnboardingAnswers): number {
  let n = 0;
  for (const s of ONBOARDING_SECTIONS) for (const qd of s.questions) if (qd.answered(a)) n++;
  return n;
}

export function labelOf(options: Option[], value: string | null | undefined): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

// ── Break-even math ────────────────────────────────────────────────────────

export interface CostInputs {
  aovCents: number | null;
  cogsCents: number | null;
  shippingCents: number | null;
  fulfillmentCents: number | null;
  processingBps: number | null;
  otherCents: number | null;
  refundsBps: number | null;
}

/** The concept form's example order — shown (dimmed) until real numbers exist. */
export const EXAMPLE_COSTS: CostInputs = {
  aovCents: 8900,
  cogsCents: 2100,
  shippingCents: 740,
  fulfillmentCents: 325,
  processingBps: 300,
  otherCents: 340,
  refundsBps: 350,
};

export type BreakEven =
  | { state: "empty" }
  | { state: "noaov" }
  | {
      state: "ok";
      /** Dollars. */
      aov: number;
      /** Dollars left per order before ad spend (may be ≤ 0). */
      contribution: number;
      /** contribution ÷ aov. */
      margin: number;
      /** 1 ÷ margin; Infinity when the order loses money before ads. */
      roas: number;
    };

/**
 * Break-even ROAS = 1 ÷ (margin per order ÷ order value). Processing and
 * refunds are percentages of the order value; the rest are flat per order.
 * "empty" = nothing entered yet (callers show EXAMPLE_COSTS instead).
 */
export function computeBreakEven(c: CostInputs): BreakEven {
  const values = [
    c.aovCents,
    c.cogsCents,
    c.shippingCents,
    c.fulfillmentCents,
    c.processingBps,
    c.otherCents,
    c.refundsBps,
  ];
  if (values.every((v) => v == null)) return { state: "empty" };
  const aov = (c.aovCents ?? 0) / 100;
  if (!(aov > 0)) return { state: "noaov" };
  const flat =
    ((c.cogsCents ?? 0) + (c.shippingCents ?? 0) + (c.fulfillmentCents ?? 0) + (c.otherCents ?? 0)) / 100;
  const pct = ((c.processingBps ?? 0) + (c.refundsBps ?? 0)) / 10_000;
  const contribution = aov - flat - aov * pct;
  const margin = contribution / aov;
  return {
    state: "ok",
    aov,
    contribution,
    margin,
    roas: margin > 0 ? 1 / margin : Infinity,
  };
}

// ── Input ⇄ storage conversions (the form edits strings) ──────────────────

/**
 * "$1,250.5" → 125050; blank / unparseable → null. Commas count only as
 * thousands separators — a decimal comma ("12,50") is rejected, never read
 * as $1,250.
 */
export function parseMoneyToCents(s: string): number | null {
  const v = s.replace(/[^0-9.,]/g, "");
  if (v.includes(",") && !/^\d{1,3}(,\d{3})*(\.\d*)?$/.test(v)) return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "3.5" or "3,5" (%) → 350 bps; blank / unparseable → null. */
export function parsePercentToBps(s: string): number | null {
  // A percentage never needs a thousands separator, so a comma is a decimal.
  const n = parseFloat(s.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** 740 → "7.4", 8900 → "89", null → "". Same shape for bps → percent. */
export function hundredthsToInput(v: number | null): string {
  return v == null ? "" : String(v / 100);
}

export function formatUsdCents(cents: number | null): string {
  if (cents == null) return "";
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatBpsAsPercent(bps: number | null): string {
  return bps == null ? "" : `${bps / 100}%`;
}
