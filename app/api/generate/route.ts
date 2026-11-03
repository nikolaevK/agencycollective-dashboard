export const dynamic = "force-dynamic";
/** A 4K render (+ thinking) can take minutes; Gemini's deadline below leaves time to stream it. */
export const maxDuration = 300;

import { GoogleGenAI, Modality, type Content, type GenerateContentConfig, type GenerateContentResponse, type Part } from "@google/genai";
import { requireAdminRecord } from "@/lib/api/requireAdmin";
import { readBodyCapped } from "@/lib/api/readBodyCapped";
import {
  ALLOWED_MODES,
  geminiImageConfig,
  geminiImageModelInfo,
  resolveGeminiImageModel,
  type GenerateMode,
} from "@/lib/geminiModels";
import { ConversationStore, type Conversation } from "./conversations";
import {
  HISTORY_BUDGET_BYTES,
  MAX_BODY_BYTES,
  describeGeminiError,
  parseImageResponse,
  shouldRetryGemini,
  sniffUploadType,
  trimHistory,
} from "./geminiResult";
import {
  GENERATE_STREAM_CONTENT_TYPE,
  type GenerateErrorBody,
  type GenerateErrorCode,
  type GenerateStreamEvent,
} from "./protocol";

// See ./protocol.ts for the request fields and the NDJSON response stream.

// ─── Input constraints ────────────────────────────────────────────────────────
const MAX_PROMPT_CHARS = 4_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 4;

// ─── Multi-turn conversations (per process, bounded) ─────────────────────────
const conversations = new ConversationStore({
  ttlMs: 30 * 60 * 1000, // 30 min idle
  maxTotal: 16,
  maxPerAdmin: 2,
  maxBytes: 64 * 1024 * 1024,
});

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_GENERATE = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(adminId: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  if (rateLimitMap.size > 200) {
    rateLimitMap.forEach((entry, key) => {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    });
  }
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= RATE_LIMIT_MAX_GENERATE) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  entry.count++;
  return { ok: true };
}

// ─── Stream timing ────────────────────────────────────────────────────────────
/** Keep-alive line while Gemini renders (4K + thinking can take a minute or more). */
const PING_INTERVAL_MS = 15_000;
/** One automatic retry when Gemini is overloaded / unreachable. */
const RETRY_DELAY_MS = 2_000;
/** Gemini must answer (retry included) this long after the request arrived — under maxDuration. */
const GEMINI_DEADLINE_MS = 260_000;
/** Enqueue large result lines in slices. */
const STREAM_SLICE_BYTES = 1024 * 1024;

function jsonError(status: number, error: string, code: GenerateErrorCode, retryAfter?: number): Response {
  const body: GenerateErrorBody = retryAfter ? { error, code, retryAfter } : { error, code };
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Text of the user turn; a turn that restarts from an earlier image says so. */
function userTurnText(prompt: string, hasBaseImage: boolean, referenceCount: number): string {
  if (!hasBaseImage) return prompt;
  const refs =
    referenceCount === 0
      ? ""
      : referenceCount === 1
        ? " The next image is a reference."
        : ` The next ${referenceCount} images are references.`;
  return `The first image is the current result of our image-editing session — keep working on it.${refs}\n\n${prompt}`;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

async function generateWithRetry(
  params: { model: string; contents: Content[]; config: GenerateContentConfig },
  deadline: number,
  signal: AbortSignal,
  onRetry: () => void
): Promise<GenerateContentResponse> {
  // The SDK aborts an attempt at httpOptions.timeout: both attempts end by the deadline.
  const attempt = () =>
    ai.models.generateContent({
      ...params,
      config: { ...params.config, httpOptions: { timeout: Math.max(1, deadline - Date.now()) } },
    });
  const startedAt = Date.now();
  try {
    return await attempt();
  } catch (err) {
    if (signal.aborted || !shouldRetryGemini(err, Date.now() - startedAt)) throw err;
    onRetry();
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    if (signal.aborted) throw abortError();
    return attempt();
  }
}

type ImageRead = { part: Part } | { error: Response } | null;

async function readImage(entry: FormDataEntryValue | null): Promise<ImageRead> {
  if (!(entry instanceof File) || entry.size === 0) return null;
  const name = entry.name || "image";
  if (entry.size > MAX_IMAGE_BYTES) {
    return { error: jsonError(413, `"${name}" is over 10 MB.`, "too_large") };
  }
  const bytes = Buffer.from(await entry.arrayBuffer());
  // Trust the bytes, not the browser-declared type.
  const mimeType = sniffUploadType(bytes.subarray(0, 16));
  if (!mimeType) {
    return { error: jsonError(400, `"${name}" isn't a PNG, JPEG or WebP image.`, "invalid_request") };
  }
  return { part: { inlineData: { mimeType, data: bytes.toString("base64") } } };
}

export async function POST(request: Request) {
  const deadline = Date.now() + GEMINI_DEADLINE_MS;
  // Fresh DB read: middleware gates /api/generate by the session token's
  // `studio` permission, which can be days stale (a revoked or deleted admin).
  const admin = await requireAdminRecord();
  if (!admin) return jsonError(401, "Your session has expired. Sign in again.", "unauthorized");
  if (!admin.isSuper && !admin.permissions.studio) {
    return jsonError(403, "You don't have access to the Image Generator.", "forbidden");
  }
  const adminId = admin.id;

  if (!process.env.GEMINI_API_KEY) {
    return jsonError(503, "Image generation is not configured (GEMINI_API_KEY is missing).", "not_configured");
  }

  // ── Body (capped like Vercel's 4.5 MB limit, also on self-hosted/dev) ──────
  const raw = await readBodyCapped(request, MAX_BODY_BYTES);
  if (!raw) {
    return jsonError(
      413,
      "The upload is too large (4.5 MB per request). Remove a reference image or use smaller ones.",
      "too_large"
    );
  }
  let formData: FormData;
  try {
    formData = await new Response(new Uint8Array(raw), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return jsonError(400, "Expected multipart form data.", "invalid_request");
  }

  // ── Fields ──────────────────────────────────────────────────────────────────
  const model = resolveGeminiImageModel(formData.get("model"));
  const info = geminiImageModelInfo(model);

  const modeRaw = formData.get("mode");
  const mode: GenerateMode =
    typeof modeRaw === "string" && ALLOWED_MODES.includes(modeRaw as GenerateMode)
      ? (modeRaw as GenerateMode)
      : "multi-turn";

  const promptRaw = formData.get("prompt");
  const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
  if (!prompt) return jsonError(400, "Enter a prompt.", "invalid_request");
  if (prompt.length > MAX_PROMPT_CHARS) {
    return jsonError(400, `The prompt is over ${MAX_PROMPT_CHARS.toLocaleString("en-US")} characters.`, "invalid_request");
  }

  // Unsupported ratios are dropped and sizes clamped to what this model accepts.
  const imageConfig = geminiImageConfig(model, {
    aspectRatio: formData.get("aspectRatio"),
    imageSize: formData.get("resolution"),
  });
  // Grounding with Google Search stays on by default where the model has it.
  const useSearch = info.search && formData.get("search") !== "0";

  // ── Images ──────────────────────────────────────────────────────────────────
  const referenceEntries = formData.getAll("image");
  if (referenceEntries.length > MAX_REFERENCE_IMAGES) {
    return jsonError(400, `Attach up to ${MAX_REFERENCE_IMAGES} reference images.`, "invalid_request");
  }
  const references: Part[] = [];
  for (const entry of referenceEntries) {
    const read = await readImage(entry);
    if (!read) continue;
    if ("error" in read) return read.error;
    references.push(read.part);
  }

  let baseImage: Part | null = null;
  if (mode === "multi-turn") {
    const read = await readImage(formData.get("baseImage"));
    if (read && "error" in read) return read.error;
    if (read) baseImage = read.part;
  }

  // ── Conversation (multi-turn) ───────────────────────────────────────────────
  // A base image starts a new conversation from that image, so it wins over
  // conversationId.
  let conversation: Conversation | null = null;
  const conversationIdRaw = formData.get("conversationId");
  if (mode === "multi-turn" && !baseImage && typeof conversationIdRaw === "string" && conversationIdRaw) {
    const found = conversations.lookup(conversationIdRaw, adminId, model);
    if (!found.ok) {
      return found.code === "conversation_busy"
        ? jsonError(409, "This conversation is still working on the previous message.", "conversation_busy")
        : jsonError(409, "This conversation is no longer held by the server.", "conversation_expired");
    }
    conversation = found.conversation;
  }

  const userContent: Content = {
    role: "user",
    parts: [
      ...(baseImage ? [baseImage] : []),
      ...references,
      { text: userTurnText(prompt, !!baseImage, references.length) },
    ],
  };
  // Counted only now that Gemini will be called — a rejected request costs no slot.
  const limit = checkRateLimit(adminId);
  if (!limit.ok) {
    return jsonError(
      429,
      `Too many generations — wait ${limit.retryAfter}s before sending another.`,
      "rate_limited",
      limit.retryAfter
    );
  }

  const history = conversation ? conversation.history : [];
  if (conversation) conversations.begin(conversation);

  // ── Generate, streamed ──────────────────────────────────────────────────────
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  request.signal?.addEventListener("abort", onRequestAbort);

  const config: GenerateContentConfig = {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
    imageConfig,
    ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
    abortSignal: abort.signal,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: GenerateStreamEvent) => {
        if (closed) return;
        try {
          const bytes = encoder.encode(JSON.stringify(event) + "\n");
          for (let i = 0; i < bytes.length; i += STREAM_SLICE_BYTES) {
            controller.enqueue(bytes.subarray(i, i + STREAM_SLICE_BYTES));
          }
        } catch {
          closed = true; // the client went away
        }
      };
      const ping = setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);

      try {
        send({ type: "status", stage: "generating" });
        const response = await generateWithRetry(
          { model, contents: [...history, userContent], config },
          deadline,
          abort.signal,
          () => send({ type: "status", stage: "retrying", message: "Gemini was busy — retrying once…" })
        );
        if (abort.signal.aborted) return; // don't record a turn the user cancelled

        const parsed = parseImageResponse(response);
        if (!parsed.images.length && !parsed.text) {
          send({
            type: "error",
            error: parsed.notice ?? "Gemini didn't return an image.",
            code: parsed.blocked ? "blocked" : "no_image",
            status: 422,
          });
          return;
        }

        // Multi-turn: append this turn (model content unchanged — it carries
        // the thought signatures Gemini needs next turn), trimmed to a size
        // that still leaves room for the next request.
        let nextConversationId: string | null = null;
        if (mode === "multi-turn") {
          const next = parsed.modelContent
            ? trimHistory([...history, userContent, parsed.modelContent], HISTORY_BUDGET_BYTES)
            : history;
          if (!next) {
            // Too large to resend: the client continues from the latest image.
            if (conversation) conversations.delete(conversation.id);
          } else if (conversation) {
            conversations.setHistory(conversation, next);
            nextConversationId = conversation.id;
          } else if (next.length) {
            nextConversationId = conversations.create(crypto.randomUUID(), adminId, model, next).id;
          }
        }

        send({
          type: "result",
          result: {
            text: parsed.text,
            images: parsed.images,
            conversationId: nextConversationId,
            model,
            imageSize: imageConfig.imageSize ?? null,
            aspectRatio: imageConfig.aspectRatio ?? null,
            notice: parsed.notice,
            sources: parsed.sources,
          },
        });
      } catch (err) {
        const described = describeGeminiError(err, { cancelled: abort.signal.aborted });
        if (!described.aborted) {
          console.error("[generate] Gemini error:", described.code, err);
          send({ type: "error", error: described.message, code: described.code, status: described.status });
        }
      } finally {
        clearInterval(ping);
        if (conversation) conversations.end(conversation);
        request.signal?.removeEventListener("abort", onRequestAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      // The browser stopped reading (Stop button / closed tab).
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": GENERATE_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
