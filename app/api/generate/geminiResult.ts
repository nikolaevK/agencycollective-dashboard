// Pure helpers for the image route: read a Gemini generateContent response,
// turn SDK errors into user-facing messages, sniff uploads, and keep a
// multi-turn history under Gemini's request-size limit. No I/O here, so it's
// unit-tested in __tests__/imageGenerate.test.ts.

import { ApiError, type Content, type GenerateContentResponse } from "@google/genai";
import { sniffMatches } from "@/lib/clientAssetRules";
import { GEMINI_UPLOAD_TYPES } from "@/lib/geminiModels";
import type { GenerateErrorCode, GenerateImage, GenerateSource } from "./protocol";

const MB = 1024 * 1024;

/** Vercel rejects function request bodies over 4.5 MB; we cap the same everywhere. */
export const MAX_BODY_BYTES = 4.5 * MB;
/** Gemini's documented cap on a request carrying inline data (prompt + base64 bytes). */
export const GEMINI_INLINE_REQUEST_LIMIT = 20 * MB;
/** Worst-case size of one new user turn once its uploads are base64-encoded (+ 4/3). */
const MAX_USER_TURN_BYTES = Math.ceil((MAX_BODY_BYTES * 4) / 3);
/**
 * Stored multi-turn history must leave room for the next user turn under the
 * request cap (1 MB slack for JSON, config and signatures).
 */
export const HISTORY_BUDGET_BYTES = GEMINI_INLINE_REQUEST_LIMIT - MAX_USER_TURN_BYTES - 1 * MB;

const OUTPUT_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SOURCES = 8;

// ─── Uploads ──────────────────────────────────────────────────────────────────

/** The real type of an uploaded image from its magic bytes, or null if Gemini can't read it. */
export function sniffUploadType(head: Uint8Array): (typeof GEMINI_UPLOAD_TYPES)[number] | null {
  return GEMINI_UPLOAD_TYPES.find((type) => sniffMatches(type, head)) ?? null;
}

// ─── History size ─────────────────────────────────────────────────────────────

/** Approximate request bytes of one content (base64 data + text + signatures). */
export function contentBytes(content: Content): number {
  let total = 64;
  for (const part of content.parts ?? []) {
    total += 32;
    total += part.inlineData?.data?.length ?? 0;
    total += part.text?.length ?? 0;
    total += part.thoughtSignature?.length ?? 0;
  }
  return total;
}

export function historyBytes(history: readonly Content[]): number {
  return history.reduce((sum, c) => sum + contentBytes(c), 0);
}

/**
 * Drop the oldest whole turns (user + model pairs — never half a turn, so
 * thought signatures stay with their turn) until the history fits `budget`.
 * Returns null when even the latest turn alone is over budget: the
 * conversation can't continue server-side and must restart from its image.
 */
export function trimHistory(history: readonly Content[], budget: number): Content[] | null {
  let start = 0;
  let total = historyBytes(history);
  while (total > budget && history.length - start > 2) {
    total -= contentBytes(history[start]) + contentBytes(history[start + 1]);
    start += 2;
  }
  if (total > budget) return null;
  return history.slice(start);
}

// ─── Response ─────────────────────────────────────────────────────────────────

export interface ParsedImageResponse {
  text: string | null;
  images: GenerateImage[];
  sources: GenerateSource[];
  /** Plain-words reason when the model stopped early / returned no image. */
  notice: string | null;
  /** Safety-blocked: the prompt (no candidate) or the output (finish reason). */
  blocked: boolean;
  /** The model turn to append to multi-turn history, unchanged (keeps thought signatures). */
  modelContent: Content | null;
}

const BLOCKED_MESSAGE =
  "Gemini blocked this request for safety reasons. Rephrase the prompt or use different reference images.";

const FINISH_NOTICES: Record<string, string> = {
  SAFETY: BLOCKED_MESSAGE,
  IMAGE_SAFETY: BLOCKED_MESSAGE,
  PROHIBITED_CONTENT: BLOCKED_MESSAGE,
  IMAGE_PROHIBITED_CONTENT: BLOCKED_MESSAGE,
  BLOCKLIST: BLOCKED_MESSAGE,
  SPII: BLOCKED_MESSAGE,
  RECITATION:
    "Gemini stopped because the result was too close to existing (possibly copyrighted) material. Try a more original prompt.",
  IMAGE_RECITATION:
    "Gemini stopped because the result was too close to existing (possibly copyrighted) material. Try a more original prompt.",
  NO_IMAGE:
    "Gemini didn't produce an image for this prompt. Try being explicit, e.g. start with “Generate an image of…”.",
  IMAGE_OTHER: "Gemini couldn't finish the image. Try again or rephrase the prompt.",
  OTHER: "Gemini couldn't finish the image. Try again or rephrase the prompt.",
  MAX_TOKENS: "Gemini's reply was cut off before it finished.",
  LANGUAGE: "Gemini doesn't support the language of this prompt yet.",
};

const NO_OUTPUT_NOTICE = FINISH_NOTICES.NO_IMAGE;

const SAFETY_FINISH_REASONS = new Set([
  "SAFETY",
  "IMAGE_SAFETY",
  "PROHIBITED_CONTENT",
  "IMAGE_PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
]);

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Read a generateContent response: final text + images (thought parts skipped), sources, why it stopped. */
export function parseImageResponse(response: GenerateContentResponse): ParsedImageResponse {
  const blockReason = response.promptFeedback?.blockReason;
  const candidate = response.candidates?.[0];
  if (!candidate) {
    return {
      text: null,
      images: [],
      sources: [],
      notice: blockReason ? BLOCKED_MESSAGE : NO_OUTPUT_NOTICE,
      blocked: !!blockReason,
      modelContent: null,
    };
  }

  const texts: string[] = [];
  const images: GenerateImage[] = [];
  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    // Interim "thinking" text and images are not the answer.
    if (part.thought) continue;
    if (typeof part.text === "string" && part.text) texts.push(part.text);
    const data = part.inlineData?.data;
    const mimeType = part.inlineData?.mimeType ?? "";
    if (data && mimeType.startsWith("image/")) {
      images.push({ mimeType: OUTPUT_IMAGE_TYPES.has(mimeType) ? mimeType : "image/png", data });
    }
  }
  const text = texts.join("").trim() || null;

  const finishReason = candidate.finishReason ? String(candidate.finishReason) : null;
  let notice: string | null = null;
  if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_UNSPECIFIED") {
    notice = FINISH_NOTICES[finishReason] ?? NO_OUTPUT_NOTICE;
  }
  if (!images.length && !text && !notice) notice = NO_OUTPUT_NOTICE;
  // An image that arrived complete needs no warning about a later stop.
  if (images.length && notice === NO_OUTPUT_NOTICE) notice = null;

  const sources: GenerateSource[] = [];
  const seen = new Set<string>();
  for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!isHttpUrl(uri) || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ uri, title: chunk.web?.title?.trim() || null });
    if (sources.length >= MAX_SOURCES) break;
  }

  const hasParts = parts.some((p) => !!p.text || !!p.inlineData?.data || !!p.thoughtSignature);
  return {
    text,
    images,
    sources,
    notice,
    blocked: !!finishReason && SAFETY_FINISH_REASONS.has(finishReason),
    modelContent: hasParts && candidate.content ? { ...candidate.content, role: "model" } : null,
  };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export interface DescribedError {
  status: number;
  code: GenerateErrorCode;
  message: string;
  /** The caller went away — nothing to report. */
  aborted: boolean;
}

/** Google's own error text from an SDK ApiError (its message is the JSON error body). */
export function googleErrorDetail(err: ApiError): string {
  try {
    const body = JSON.parse(err.message) as { error?: { message?: unknown } };
    const message = body.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  } catch {
    /* not JSON */
  }
  return err.message.slice(0, 300);
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "APIUserAbortError");
}

/**
 * `cancelled`: whether the caller aborted the request itself. An abort it
 * didn't make is the SDK's request timeout (httpOptions.timeout).
 */
export function describeGeminiError(err: unknown, { cancelled = true }: { cancelled?: boolean } = {}): DescribedError {
  const base = { aborted: false };
  if (isAbort(err)) {
    if (!cancelled) {
      return {
        ...base,
        status: 504,
        code: "upstream_unavailable",
        message: "Gemini took too long to answer. Try again, or a lower resolution.",
      };
    }
    return { ...base, status: 499, code: "internal", message: "Cancelled.", aborted: true };
  }
  if (err instanceof ApiError) {
    const status = err.status;
    if (status === 429) {
      return {
        ...base,
        status: 429,
        code: "upstream_rate_limited",
        message: "Gemini's rate limit or quota was reached. Wait a minute and try again.",
      };
    }
    if (status === 401 || status === 403) {
      return {
        ...base,
        status: 502,
        code: "not_configured",
        message: "Gemini refused the API key. Check GEMINI_API_KEY and its access to this model.",
      };
    }
    if (status === 404) {
      return {
        ...base,
        status: 502,
        code: "model_unavailable",
        message: "This model isn't available to the configured API key. Pick another model.",
      };
    }
    if (status === 408 || status >= 500) {
      return {
        ...base,
        status: 503,
        code: "upstream_unavailable",
        message: "Gemini is busy or unavailable right now. Try again in a moment.",
      };
    }
    return {
      ...base,
      status: 422,
      code: "upstream_error",
      message: `Gemini rejected the request: ${googleErrorDetail(err)}`,
    };
  }
  // fetch() network failure inside the SDK.
  if (err instanceof TypeError) {
    return {
      ...base,
      status: 503,
      code: "upstream_unavailable",
      message: "Couldn't reach Gemini. Try again in a moment.",
    };
  }
  return { ...base, status: 500, code: "internal", message: "Image generation failed unexpectedly. Try again." };
}

// ─── Retry ────────────────────────────────────────────────────────────────────

/** Only a first attempt that failed this fast is retried (see shouldRetryGemini). */
export const RETRY_WINDOW_MS = 20_000;

/** Causes of undici's "fetch failed" that mean the connection never got going. */
const CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function isConnectFailure(err: unknown): boolean {
  // "terminated" (a body cut short mid-download) and header/body timeouts are not.
  if (!(err instanceof TypeError) || err.message !== "fetch failed") return false;
  const code = (err.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && CONNECT_ERROR_CODES.has(code);
}

/**
 * Worth one automatic retry: Gemini answered 408 / 5xx (overloaded) or the
 * connection never opened — and the attempt failed fast. A slow failure, a
 * download cut short or a timeout may come after the image was rendered (and
 * billed), so retrying could bill it twice. 429 is quota: retrying won't help.
 */
export function shouldRetryGemini(err: unknown, elapsedMs: number): boolean {
  if (elapsedMs >= RETRY_WINDOW_MS) return false;
  if (err instanceof ApiError) return err.status === 408 || err.status >= 500;
  return isConnectFailure(err);
}
