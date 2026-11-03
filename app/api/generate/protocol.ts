// Wire protocol of POST /api/generate — shared by the route and the Image
// Generator UI (type-only on the client). Pure: no server imports.
//
// Request: multipart/form-data (≤ 4.5 MB — Vercel's function body cap)
//   prompt          string (required, ≤ 4,000 chars)
//   model           Gemini image model id (retired ids map to their replacement)
//   mode            "multi-turn" | "single-turn"
//   resolution      "512" | "1K" | "2K" | "4K" (clamped to what the model supports)
//   aspectRatio     e.g. "4:5" (omitted / unsupported → the model decides)
//   search          "1" | "0" — Grounding with Google Search (models that support it)
//   conversationId  multi-turn: continue this server-side conversation
//   baseImage       multi-turn: start a new conversation FROM this image
//                   (a branch, an expired session or a model switch)
//   image           0–4 reference images (PNG / JPEG / WebP, magic-byte checked)
//
// Response: errors found before generation starts are plain JSON
// `{ error, code, retryAfter? }` with a 4xx/5xx status. Otherwise 200 with an
// NDJSON stream (one GenerateStreamEvent per line): status/ping lines while
// Gemini works, then exactly one `result` or `error` line. Streaming keeps the
// connection alive during long renders and lifts Vercel's 4.5 MB response cap
// (a 4K PNG is often larger than that once base64-encoded).

export const GENERATE_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export type GenerateErrorCode =
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "invalid_request"
  | "too_large"
  | "not_configured"
  /** The server no longer holds this conversation (expired, another instance, model changed). */
  | "conversation_expired"
  /** Another request for this conversation is still running. */
  | "conversation_busy"
  | "blocked"
  | "no_image"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "model_unavailable"
  | "upstream_error"
  | "internal";

export interface GenerateImage {
  mimeType: string;
  /** base64 */
  data: string;
}

export interface GenerateSource {
  uri: string;
  title: string | null;
}

export interface GenerateResult {
  text: string | null;
  images: GenerateImage[];
  /**
   * Multi-turn: the conversation to continue next turn. null when the turn
   * can't be continued server-side (single-turn, or its images are too big to
   * resend) — the next turn then starts from the latest image instead.
   */
  conversationId: string | null;
  model: string;
  imageSize: string | null;
  aspectRatio: string | null;
  /** Why the model returned no image / was cut short, in plain words. */
  notice: string | null;
  /** Web pages Google Search grounding used. */
  sources: GenerateSource[];
}

export type GenerateStreamEvent =
  | { type: "status"; stage: "generating" | "retrying"; message?: string }
  | { type: "ping" }
  | { type: "result"; result: GenerateResult }
  | { type: "error"; error: string; code: GenerateErrorCode; status: number; retryAfter?: number };

export interface GenerateErrorBody {
  error: string;
  code: GenerateErrorCode;
  retryAfter?: number;
}
