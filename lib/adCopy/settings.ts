import type { GenerationSettings, LengthId, ToneId } from "./types";

/**
 * Generation settings vocabulary — pure, client-safe (the brief form renders
 * these lists; the route normalizes whatever the client sent with
 * `normalizeSettings`, so a stale or hand-crafted body can't widen the caps).
 */

export const INDUSTRY_PRESETS = [
  { id: "peptides", label: "Peptides" },
  { id: "supplements", label: "Supplements" },
  { id: "skincare", label: "Skincare" },
  { id: "fitness", label: "Fitness" },
  { id: "wellness", label: "Health & Wellness" },
  { id: "custom", label: "Custom…" },
] as const;

export type IndustryId = (typeof INDUSTRY_PRESETS)[number]["id"];

export const TONES: readonly { id: ToneId; label: string; prompt: string }[] = [
  {
    id: "mixed",
    label: "Mix of angles",
    prompt: "Give each primary text a different angle (offer-led, benefit-led, story, authority, objection-handling…).",
  },
  { id: "direct", label: "Direct response", prompt: "Direct response: lead with the core benefit or the offer, concrete and conversion-focused." },
  { id: "educational", label: "Educational", prompt: "Educational: teach one useful thing about the category, then bridge to the product and offer." },
  { id: "story", label: "Story / UGC", prompt: "Story / UGC: first-person and conversational, like a real customer's post — no polished ad-speak." },
  { id: "urgency", label: "Offer & urgency", prompt: "Offer-led: open with the promo or discount and give a real reason to act now. Never invent deadlines or scarcity." },
  { id: "premium", label: "Premium / authority", prompt: "Premium authority: confident and expert — quality, sourcing, testing, standards." },
];

export const LENGTHS: readonly { id: LengthId; label: string; prompt: string }[] = [
  { id: "short", label: "Short", prompt: "Short: one or two sentences, ideally under 125 characters so it shows in full in the feed." },
  { id: "medium", label: "Medium", prompt: "Medium: two or three short paragraphs; the first ~125 characters must hook on their own." },
  { id: "long", label: "Long", prompt: "Long-form direct response: three to five short paragraphs ending in a clear call to action; the first ~125 characters must hook on their own." },
];

export const COUNT_LIMITS = { min: 1, max: 10 } as const;
export const INSTRUCTIONS_MAX = 1500;
export const CUSTOM_INDUSTRY_MAX = 100;

export const DEFAULT_SETTINGS: GenerationSettings = {
  industry: "peptides",
  customIndustry: "",
  tone: "mixed",
  length: "long",
  emojis: false,
  primaryCount: 5,
  headlineCount: 5,
  descriptionCount: 3,
  instructions: "",
};

function clampCount(v: unknown, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(COUNT_LIMITS.max, Math.max(COUNT_LIMITS.min, n));
}

/** Strip control characters (keep line breaks/tabs) and cap the length. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

/** Validate a client-sent settings object; anything missing/invalid falls back to the defaults. */
export function normalizeSettings(raw: unknown): GenerationSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const industryIds = INDUSTRY_PRESETS.map((p) => p.id) as readonly string[];
  const industry = typeof r.industry === "string" && industryIds.includes(r.industry) ? r.industry : DEFAULT_SETTINGS.industry;
  const customIndustry = industry === "custom" ? cleanText(r.customIndustry, CUSTOM_INDUSTRY_MAX) : "";
  return {
    industry: industry === "custom" && !customIndustry ? DEFAULT_SETTINGS.industry : industry,
    customIndustry,
    tone: TONES.some((t) => t.id === r.tone) ? (r.tone as ToneId) : DEFAULT_SETTINGS.tone,
    length: LENGTHS.some((l) => l.id === r.length) ? (r.length as LengthId) : DEFAULT_SETTINGS.length,
    emojis: r.emojis === true,
    primaryCount: clampCount(r.primaryCount, DEFAULT_SETTINGS.primaryCount),
    headlineCount: clampCount(r.headlineCount, DEFAULT_SETTINGS.headlineCount),
    descriptionCount: clampCount(r.descriptionCount, DEFAULT_SETTINGS.descriptionCount),
    instructions: cleanText(r.instructions, INSTRUCTIONS_MAX),
  };
}

/** Human label for the industry the copy is written for. */
export function industryLabel(s: Pick<GenerationSettings, "industry" | "customIndustry">): string {
  if (s.industry === "custom" && s.customIndustry) return s.customIndustry;
  return INDUSTRY_PRESETS.find((p) => p.id === s.industry)?.label ?? "Peptides";
}
