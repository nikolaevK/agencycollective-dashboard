import { base64DecodedBytes, base64Head, isBase64, sniffImageType, type ImageMediaType } from "./images";
import { cleanText, normalizeSettings } from "./settings";
import type { CampaignContext, CreativeFacts } from "./prompt";
import type { CopyField, GenerationMode, GenerationSettings, KeptCopy } from "./types";

/**
 * Validation of the POST /api/ad-copy body — pure (unit-tested). Field names
 * of the original API are kept (selectedCreatives, uploadedImages,
 * campaignName, …); `settings` and `mode` are new and optional.
 */

export const GENERATE_LIMITS = {
  creatives: 10,
  uploads: 10,
  /** Decoded bytes per image: Claude caps an image at 5 MB of base64 (≈3.75 MB decoded). */
  imageBytes: 3_750_000,
  text: 5000,
  name: 400,
  items: 10,
} as const;

export interface CreativeInput extends CreativeFacts {
  adId: string;
  imageUrl: string | null;
}

export interface UploadInput {
  name: string;
  base64: string;
  mediaType: ImageMediaType;
}

export interface GenerateRequest {
  creatives: CreativeInput[];
  uploads: UploadInput[];
  campaign: CampaignContext;
  model: string | null;
  settings: GenerationSettings;
  mode: GenerationMode;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function optText(v: unknown, max: number): string | null {
  const t = cleanText(v, max);
  return t ? t : null;
}

function parseCreative(raw: unknown): CreativeInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const adId = typeof r.adId === "string" && /^\d{1,30}$/.test(r.adId) ? r.adId : null;
  if (!adId) return null;
  return {
    adId,
    adName: cleanText(r.adName, GENERATE_LIMITS.name) || `Ad ${adId}`,
    imageUrl: typeof r.imageUrl === "string" && r.imageUrl.length <= 4096 ? r.imageUrl : null,
    existingPrimaryText: optText(r.existingPrimaryText, GENERATE_LIMITS.text),
    existingHeadline: optText(r.existingHeadline, GENERATE_LIMITS.name),
    existingDescription: optText(r.existingDescription, GENERATE_LIMITS.name),
    spend: Math.max(0, num(r.spend) ?? 0),
    ctr: Math.max(0, num(r.ctr) ?? 0),
  };
}

/** Uploaded image: real base64, under the cap, and actually the image type it claims (sniffed). */
export function parseUpload(raw: unknown): Validation<UploadInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid uploaded image" };
  const r = raw as Record<string, unknown>;
  const name = cleanText(r.name, 200) || "upload";
  const b64 = typeof r.base64 === "string" ? r.base64 : "";
  if (!isBase64(b64)) return { ok: false, error: `"${name}" isn't valid image data` };
  if (base64DecodedBytes(b64) > GENERATE_LIMITS.imageBytes) return { ok: false, error: `"${name}" is too large` };
  const sniffed = sniffImageType(base64Head(b64));
  if (!sniffed) return { ok: false, error: `"${name}" isn't a JPEG, PNG, GIF or WebP image` };
  return { ok: true, value: { name, base64: b64, mediaType: sniffed } };
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => cleanText(s, max)).filter(Boolean).slice(0, GENERATE_LIMITS.items);
}

export function parseKept(raw: unknown): KeptCopy {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const primaries = Array.isArray(r.primaryTexts) ? r.primaryTexts : [];
  return {
    primaryTexts: primaries
      .map((p) => {
        const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
        return { angle: cleanText(o.angle, 60), text: cleanText(o.text, GENERATE_LIMITS.text) };
      })
      .filter((p) => p.text)
      .slice(0, GENERATE_LIMITS.items),
    headlines: strList(r.headlines, 255),
    descriptions: strList(r.descriptions, 255),
  };
}

const FIELDS: CopyField[] = ["primaryText", "headline", "description"];

export function parseMode(raw: unknown): Validation<GenerationMode> {
  if (raw == null) return { ok: true, value: { kind: "full" } };
  if (typeof raw !== "object") return { ok: false, error: "Invalid mode" };
  const r = raw as Record<string, unknown>;
  if (r.kind === undefined || r.kind === "full") {
    const keep = r.keep == null ? undefined : parseKept(r.keep);
    return { ok: true, value: { kind: "full", ...(keep ? { keep } : {}) } };
  }
  if (r.kind !== "variant") return { ok: false, error: "Invalid mode" };
  const field = FIELDS.find((f) => f === r.field);
  if (!field) return { ok: false, error: "Invalid mode.field" };
  const current = parseKept(r.current);
  const list = field === "primaryText" ? current.primaryTexts : field === "headline" ? current.headlines : current.descriptions;
  const index = typeof r.index === "number" && Number.isInteger(r.index) ? r.index : -1;
  if (index < 0 || index >= list.length) return { ok: false, error: "Invalid mode.index" };
  return { ok: true, value: { kind: "variant", field, index, current } };
}

export function parseGenerateRequest(raw: unknown): Validation<GenerateRequest> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request body" };
  const b = raw as Record<string, unknown>;

  const rawCreatives = Array.isArray(b.selectedCreatives) ? b.selectedCreatives : [];
  if (rawCreatives.length > GENERATE_LIMITS.creatives) return { ok: false, error: `Maximum ${GENERATE_LIMITS.creatives} creatives allowed` };
  const creatives = rawCreatives.map(parseCreative);
  if (creatives.some((c) => c === null)) return { ok: false, error: "Invalid creative in selectedCreatives" };

  const rawUploads = Array.isArray(b.uploadedImages) ? b.uploadedImages : [];
  if (rawUploads.length > GENERATE_LIMITS.uploads) return { ok: false, error: `Maximum ${GENERATE_LIMITS.uploads} uploaded images allowed` };
  const uploads: UploadInput[] = [];
  for (const u of rawUploads) {
    const parsed = parseUpload(u);
    if (!parsed.ok) return parsed;
    uploads.push(parsed.value);
  }
  if (creatives.length === 0 && uploads.length === 0) {
    return { ok: false, error: "At least one creative or uploaded image is required" };
  }

  const campaignName = cleanText(b.campaignName, GENERATE_LIMITS.name);
  if (!campaignName) return { ok: false, error: "campaignName is required" };

  const mode = parseMode(b.mode);
  if (!mode.ok) return mode;

  // Legacy flat industry fields still work when `settings` is absent.
  const settingsRaw =
    b.settings && typeof b.settings === "object"
      ? b.settings
      : { industry: b.industry, customIndustry: b.customIndustry };

  return {
    ok: true,
    value: {
      creatives: creatives as CreativeInput[],
      uploads,
      campaign: {
        name: campaignName,
        objective: optText(b.campaignObjective, 100),
        spend: num(b.campaignSpend),
        roas: num(b.campaignRoas),
      },
      model: typeof b.model === "string" ? b.model : null,
      settings: normalizeSettings(settingsRaw),
      mode: mode.value,
    },
  };
}
