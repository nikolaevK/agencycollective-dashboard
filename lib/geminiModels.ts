import { Gauge, Layers, Sparkles, Zap, type LucideIcon } from "lucide-react";

// ─── Gemini native image models ("Nano Banana") ───────────────────────────────
// Verified 2026-11-02 against Google's docs: aistudio.google.com/docs/models,
// /docs/image-generation, /docs/deprecations and the generateContent API
// reference. Shared by the Image Generator and the JSON Editor (route + UI),
// so keep the exported names stable. Pure module: no server-only imports.
//
// Imagen is shut down ("Imagen models are shut down. Use Nano Banana models
// for all image generation tasks") and the preview ids this app used are past
// their shutdown dates — see RETIRED_GEMINI_IMAGE_MODELS.

/** Output sizes Gemini accepts in `imageConfig.imageSize` (uppercase K; "512" = 0.5K). */
export type GeminiImageSize = "512" | "1K" | "2K" | "4K";
export const GEMINI_IMAGE_SIZES: readonly GeminiImageSize[] = ["512", "1K", "2K", "4K"];

/** The 14 ratios of Nano Banana 2.1 / 3.1 Flash Image. */
const RATIOS_14 = [
  "1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1",
] as const;
/** The 10 ratios of 3 Pro Image and 3.1 Flash Lite Image. */
const RATIOS_10 = ["1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9"] as const;

export interface GeminiImageModel {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** imageSize values the model accepts. */
  sizes: readonly GeminiImageSize[];
  /** imageConfig.aspectRatio values the model accepts. */
  aspectRatios: readonly string[];
  /** Grounding with Google Search is supported. */
  search: boolean;
}

export const GEMINI_IMAGE_MODELS = [
  {
    id: "gemini-nano-banana-2.1",
    label: "Nano Banana 2.1",
    description: "Latest — best detail, text and multi-turn edits",
    icon: Sparkles,
    sizes: ["1K", "2K", "4K"],
    aspectRatios: RATIOS_14,
    search: true,
  },
  {
    id: "gemini-3-pro-image",
    label: "Nano Banana Pro",
    description: "Studio quality for complex layouts and text",
    icon: Layers,
    sizes: ["1K", "2K", "4K"],
    aspectRatios: RATIOS_10,
    search: true,
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    description: "Fast production model, adds 512px drafts",
    icon: Zap,
    sizes: ["512", "1K", "2K", "4K"],
    aspectRatios: RATIOS_14,
    search: true,
  },
  {
    id: "gemini-3.1-flash-lite-image",
    label: "Nano Banana 2 Lite",
    description: "Fastest and cheapest — 1K, simple edits",
    icon: Gauge,
    sizes: ["1K"],
    aspectRatios: RATIOS_10,
    search: false,
  },
] as const satisfies readonly GeminiImageModel[];

/** A model id Google currently serves. */
export type LiveGeminiImageModelId = (typeof GEMINI_IMAGE_MODELS)[number]["id"];

/**
 * Retired ids → their replacement (Google's deprecations page). Kept so old
 * clients, saved sessions and the JSON Editor's literal default still resolve.
 */
export const RETIRED_GEMINI_IMAGE_MODELS = {
  // Shut down 2026-06-25 → Google's listed replacement.
  "gemini-3.1-flash-image-preview": "gemini-nano-banana-2.1",
  // Shut down 2025-11-14.
  "gemini-2.0-flash-preview-image-generation": "gemini-nano-banana-2.1",
  // Shut down 2025-11-10 (Imagen was the "highest quality" pick → Pro).
  "imagen-3.0-generate-002": "gemini-3-pro-image",
} as const satisfies Record<string, LiveGeminiImageModelId>;

export type RetiredGeminiImageModelId = keyof typeof RETIRED_GEMINI_IMAGE_MODELS;

/**
 * Any id callers may still hold. Includes the retired ids only so existing
 * code keeps compiling — always pass ids through resolveGeminiImageModel()
 * before calling Google.
 */
export type GeminiImageModelId = LiveGeminiImageModelId | RetiredGeminiImageModelId;

export const DEFAULT_GEMINI_IMAGE_MODEL: LiveGeminiImageModelId = "gemini-nano-banana-2.1";

/** Live model ids (what a request may name). */
export const ALLOWED_GEMINI_MODELS: readonly GeminiImageModelId[] = GEMINI_IMAGE_MODELS.map((m) => m.id);

export type GenerateMode = "multi-turn" | "single-turn";
export const ALLOWED_MODES: readonly GenerateMode[] = ["multi-turn", "single-turn"];

/** Input images Gemini reads that the browser can also produce (no GIF). */
export const GEMINI_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Untrusted value → a live model id (retired → replacement, unknown → default). */
export function resolveGeminiImageModel(raw: unknown): LiveGeminiImageModelId {
  if (typeof raw !== "string") return DEFAULT_GEMINI_IMAGE_MODEL;
  const live = GEMINI_IMAGE_MODELS.find((m) => m.id === raw);
  if (live) return live.id;
  if (Object.prototype.hasOwnProperty.call(RETIRED_GEMINI_IMAGE_MODELS, raw)) {
    return RETIRED_GEMINI_IMAGE_MODELS[raw as RetiredGeminiImageModelId];
  }
  return DEFAULT_GEMINI_IMAGE_MODEL;
}

/** Registry entry for any id — never undefined (retired/unknown → its replacement). */
export function geminiImageModelInfo(id: unknown): GeminiImageModel & { id: LiveGeminiImageModelId } {
  const live = resolveGeminiImageModel(id);
  return GEMINI_IMAGE_MODELS.find((m) => m.id === live)!;
}

/**
 * The size to request: the requested one when the model supports it, else
 * the nearest supported size (ties go up). No/invalid request → the model's
 * largest size (this app has always defaulted to 4K).
 */
export function clampImageSize(model: unknown, requested: unknown): GeminiImageSize {
  const { sizes } = geminiImageModelInfo(model);
  const largest = sizes[sizes.length - 1];
  if (typeof requested !== "string") return largest;
  const want = GEMINI_IMAGE_SIZES.indexOf(requested as GeminiImageSize);
  if (want === -1) return largest;
  if (sizes.includes(requested as GeminiImageSize)) return requested as GeminiImageSize;
  let best = largest;
  let bestDistance = Infinity;
  for (const size of sizes) {
    const distance = Math.abs(GEMINI_IMAGE_SIZES.indexOf(size) - want);
    const isUp = GEMINI_IMAGE_SIZES.indexOf(size) > want;
    if (distance < bestDistance || (distance === bestDistance && isUp)) {
      best = size;
      bestDistance = distance;
    }
  }
  return best;
}

/** True when the model accepts this aspect ratio. */
export function isAspectRatioFor(model: unknown, ratio: unknown): ratio is string {
  return typeof ratio === "string" && geminiImageModelInfo(model).aspectRatios.includes(ratio);
}

/**
 * `imageConfig` for generateContent with only the fields this model accepts:
 * an unsupported aspect ratio is dropped (the model picks one from the input
 * images, else 1:1); a size is clamped to the model's sizes.
 */
export function geminiImageConfig(
  model: unknown,
  opts: { aspectRatio?: unknown; imageSize?: unknown } = {}
): { aspectRatio?: string; imageSize?: GeminiImageSize } {
  const config: { aspectRatio?: string; imageSize?: GeminiImageSize } = {};
  if (isAspectRatioFor(model, opts.aspectRatio)) config.aspectRatio = opts.aspectRatio;
  config.imageSize = clampImageSize(model, opts.imageSize);
  return config;
}

/** Short use hints for the aspect-ratio picker (Meta placements first). */
export const ASPECT_RATIO_HINTS: Record<string, string> = {
  "1:1": "Square · feed",
  "4:5": "Portrait · feed",
  "9:16": "Stories / Reels",
  "16:9": "Landscape",
  "5:4": "Landscape",
  "3:4": "Portrait",
  "4:3": "Landscape",
  "2:3": "Portrait",
  "3:2": "Landscape",
  "21:9": "Ultra-wide",
  "1:4": "Tall banner",
  "4:1": "Wide banner",
  "1:8": "Skyscraper",
  "8:1": "Leaderboard",
};

/** Human label for a size value. */
export function imageSizeLabel(size: GeminiImageSize): string {
  return size === "512" ? "512px" : size;
}
