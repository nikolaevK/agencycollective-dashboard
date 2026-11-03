export const dynamic = "force-dynamic";
/** A text-heavy image can keep Claude thinking for a few minutes. */
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { DEFAULT_MODEL } from "@/lib/chatModels";
import { describeClaudeError } from "@/lib/claude/errors";
import { isImageRole, isUseCase, type ImageRole } from "@/lib/jsonEditor/useCases";
import { analysisSchema } from "@/lib/jsonEditor/schemas";
import { analysisSystemPrompt, ANALYSIS_USER_TEXT } from "@/lib/jsonEditor/prompts";
import { isPlainObject } from "@/lib/jsonEditor/diff";
import { refusalMessage, type JsonEditorErrorCode } from "@/lib/jsonEditor/errors";
import { MAX_UPLOAD_IMAGE_BYTES } from "@/lib/jsonEditor/images";
import { fitForClaude, readImageUpload, readUploadForm } from "@/lib/jsonEditor/serverImage";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Claude request settings ───────────────────────────────────────────────
// One-shot image → JSON extraction. `medium` (the Opus 5.5 default, set
// explicitly): precise colors / materials / text transcription is the whole
// point, and Opus 5.5 reads images well at this level; `low` is the next
// thing to try if latency ever matters more than exhaustive object lists.
const ANALYZE_EFFORT = "medium" as const;
// Thinking counts toward max_tokens, and a text-heavy image (menus, packaging)
// makes a long JSON. Streamed (see below), so a large cap can't hit the SDK's
// non-streaming request timeout.
const ANALYZE_MAX_TOKENS = 32_000;
// Policy declines are retried server-side on the provider's default fallback model.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** One image plus two short fields; a body over this is refused before it's buffered. */
const MAX_REQUEST_BYTES = MAX_UPLOAD_IMAGE_BYTES + 256 * 1024;

// ─── Rate limiter (in-memory, per admin, with periodic cleanup) ────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Evict expired entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000).unref();

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function fail(status: number, error: string, code?: JsonEditorErrorCode, extra?: Record<string, unknown>): Response {
  return json({ error, ...(code ? { code } : {}), ...extra }, status);
}

export async function POST(request: Request) {
  // ── Auth + permission check ──────────────────────────────────────────────
  const session = getAdminSession();
  if (!session) return fail(401, "Unauthorized");
  if (!session.isSuper && !session.permissions?.jsoneditor) return fail(403, "Forbidden");

  if (!checkRateLimit(session.adminId)) {
    return json(
      { error: "Too many requests. Please wait before sending another request." },
      429,
      { "Retry-After": "60" }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) return fail(500, "Image analysis is not configured");

  const read = await readUploadForm(request, MAX_REQUEST_BYTES);
  if (!read.ok) {
    return read.status === 413
      ? fail(413, "The image is too large to upload (max 10 MB).", "too_large")
      : fail(400, "Expected a multipart form upload");
  }
  const formData = read.form;

  // ── Use case + image role ──────────────────────────────────────────────
  const useCase = formData.get("useCase");
  if (!isUseCase(useCase)) return fail(400, "Invalid use case");
  const roleRaw = formData.get("imageRole");
  const role: ImageRole = isImageRole(roleRaw) ? roleRaw : "source";

  // ── Image (type sniffed from its bytes, EXIF-rotated upright) ───────────
  const upload = await readImageUpload(formData.get("image"), "Image");
  if (!upload.ok) return fail(upload.status, upload.error, upload.status === 413 ? "too_large" : undefined);

  try {
    const fitted = await fitForClaude(upload.buffer, upload.type);
    if (!fitted) return fail(413, "The image is too large to analyze — try a smaller one.", "too_large");

    // ── Call Claude ────────────────────────────────────────────────────────
    // System prompt first, then the image + instruction. The schema
    // guarantees parseable JSON. No cache breakpoint: the prompt is far below
    // the minimum cacheable prefix, and the image differs every call.
    // Streamed and collected with finalMessage(): same request and result as
    // create(), but a long thinking + JSON run can't hit the request timeout.
    const stream = anthropic.beta.messages.stream(
      {
        model: DEFAULT_MODEL,
        max_tokens: ANALYZE_MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: {
          effort: ANALYZE_EFFORT,
          format: { type: "json_schema", schema: analysisSchema(useCase, role) },
        },
        system: [{ type: "text", text: analysisSystemPrompt(useCase, role) }],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: fitted.mediaType, data: fitted.data.toString("base64") },
              },
              { type: "text", text: ANALYSIS_USER_TEXT },
            ],
          },
        ],
      },
      // The user cancelled (Start over / left) → stop paying for the call.
      { signal: request.signal }
    );
    const response = await stream.finalMessage();

    // ── Stop reason first: a refusal or a cut-off may not match the schema ─
    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? null;
      console.warn("[json-editor/analyze] refusal", { category, model: response.model });
      return fail(422, refusalMessage(category), "refusal", { category });
    }
    if (response.stop_reason === "max_tokens") {
      return fail(
        502,
        "The description got too long to finish. Try a simpler or cropped image.",
        "truncated"
      );
    }

    // Read by block type — thinking / fallback blocks come first.
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!isPlainObject(parsed)) {
      console.error("[json-editor/analyze] unparseable output", { stop: response.stop_reason, chars: text.length });
      return fail(502, "The analysis came back malformed. Please try again.", "bad_output");
    }

    return json({ json: JSON.stringify(parsed, null, 2), model: response.model }, 200);
  } catch (err) {
    if (request.signal.aborted || err instanceof Anthropic.APIUserAbortError) {
      return fail(499, "Cancelled");
    }
    // Classified by the shared mapper; the copy is this tool's own (its
    // messages talk about chats). Provider text only goes to the log.
    const { code } = describeClaudeError(err);
    if (code !== "rate_limited") {
      console.error("[json-editor/analyze] failed:", code, err instanceof Anthropic.APIError ? err.message : err);
    }
    switch (code) {
      case "rate_limited":
        return fail(429, "The AI service is busy right now. Try again in a minute.", "upstream_rate_limited");
      case "overloaded":
      case "unavailable":
        return fail(503, "The AI service is temporarily unavailable. Try again shortly.", "upstream_unavailable");
      case "too_large":
        return fail(413, "The image is too large to analyze — try a smaller one.", "too_large");
      case "auth":
        return fail(500, "Image analysis isn't set up correctly (AI service key or permissions). Ask an admin to check it.");
      case "bad_request":
        // A 400 names the field it rejects; one under the image block is the
        // image (e.g. a damaged file), anything else is this route's request.
        return isImageRejection(err)
          ? fail(422, "The AI service couldn't read this image. Try re-saving it as PNG or JPEG, or use a different image.")
          : fail(502, "The AI service rejected the analysis request. Try again — if it keeps happening, ask an admin to check the setup.");
      default:
        return fail(500, "Internal server error");
    }
  }
}

/** A 400 about the image content block (vs. the schema / model / params). */
function isImageRejection(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  const detail = (err.error as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof detail === "string" && /\bimage\b/i.test(detail);
}
