/**
 * Ad Copy — shared, client-safe types (type-only imports). The route
 * validates the model's JSON with lib/adCopy/schema.ts (zod, server) and the
 * client only ever reads these shapes.
 */

import type { CampaignCreative } from "@/types/dashboard";

/**
 * What GET /api/ad-copy/creatives returns per ad: the shared CampaignCreative
 * plus two Ad-Copy-only hints. `existingLink` is the creative's link_data
 * link when Meta returned it (passthrough — null until the creative field
 * list in lib/meta/endpoints asks for `link`); `isVideo` marks creatives whose
 * image is only a video thumbnail.
 */
export type AdCopyCreative = CampaignCreative & { existingLink?: string | null; isVideo?: boolean };

export type CopyField = "primaryText" | "headline" | "description";

/** What the model returns (and what a validated `done` event carries). */
export interface AdCopyResult {
  /** Promo codes, discounts, prices, product names read off the creatives. */
  detectedOffers: string[];
  primaryTexts: { angle: string; text: string }[];
  headlines: string[];
  descriptions: string[];
}

/** One editable variant in the UI. `previous` = the text before the last regenerate (undo). */
export interface CopyVariant {
  id: string;
  text: string;
  /** Primary texts only: the short angle label the model gave it. */
  angle?: string;
  pinned?: boolean;
  previous?: string;
}

export type ToneId = "mixed" | "direct" | "educational" | "story" | "urgency" | "premium";
export type LengthId = "short" | "medium" | "long";

export interface GenerationSettings {
  industry: string;
  customIndustry?: string;
  tone: ToneId;
  length: LengthId;
  emojis: boolean;
  primaryCount: number;
  headlineCount: number;
  descriptionCount: number;
  /** Free-text brief: brand voice, offer details, things to avoid. */
  instructions: string;
}

/** Items the user pinned — a full regenerate keeps them and writes different ones. */
export interface KeptCopy {
  primaryTexts: { angle: string; text: string }[];
  headlines: string[];
  descriptions: string[];
}

export type GenerationMode =
  | { kind: "full"; keep?: KeptCopy }
  | {
      kind: "variant";
      field: CopyField;
      /** 0-based index of the item being replaced within `current`. */
      index: number;
      current: KeptCopy;
    };

/** NDJSON events streamed by POST /api/ad-copy (one JSON object per line). */
export type AdCopyStreamEvent =
  | { t: "status"; phase: "images" | "thinking" | "writing" }
  | { t: "thinking"; text: string }
  | { t: "text"; text: string }
  | { t: "fallback"; from: string; to: string }
  | { t: "done"; result: AdCopyResult; imagesSkipped: number; model: string }
  | { t: "error"; code: AdCopyErrorCode; message: string; category?: string | null };

export type AdCopyErrorCode =
  | "refusal"
  | "max_tokens"
  | "bad_output"
  | "rate_limited"
  | "overloaded"
  | "upstream"
  | "aborted";
