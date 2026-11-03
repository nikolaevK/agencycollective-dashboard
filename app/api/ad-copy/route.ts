export const dynamic = "force-dynamic";
// Image downloads + a long streamed generation (up to 32k tokens with thinking).
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { ALLOWED_MODELS, DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import { readJsonCapped } from "@/lib/api/readBodyCapped";
import { fetchPublicImage } from "@/lib/publicImageFetch";
import { isMetaImageUrl, sniffImageType, type ImageMediaType } from "@/lib/adCopy/images";
import { encodeEvent } from "@/lib/adCopy/ndjson";
import {
  AD_COPY_SYSTEM_PROMPT,
  END_OF_MATERIAL,
  campaignContextText,
  creativeText,
  taskText,
  uploadLabelText,
} from "@/lib/adCopy/prompt";
import { GENERATE_LIMITS, parseGenerateRequest, type GenerateRequest } from "@/lib/adCopy/request";
import { AD_COPY_JSON_SCHEMA, parseAdCopy } from "@/lib/adCopy/schema";
import type { AdCopyErrorCode, AdCopyStreamEvent } from "@/lib/adCopy/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * One-shot copywriting from images: `medium` is Opus 5.5's default and in
 * Anthropic's testing beats Opus 5 at `high`. Regenerating one variant uses
 * the SAME effort on purpose — an effort change invalidates the messages
 * cache, and the cached prefix (system + creative images) is what makes a
 * one-variant regenerate cheap.
 */
const AD_COPY_EFFORT = "medium" as const;
/** Room for adaptive thinking + up to 10 long primary texts; streamed, so no HTTP-timeout pressure. */
const MAX_TOKENS = 32_000;
/** Opus 5.5 safety classifiers can decline (e.g. `bio` on peptide copy) — let the API retry on its recommended fallback model. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** 10 uploads at ≤300 KB (client-compressed) + JSON — anything near this is not our client. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

// ─── Rate limiter (in-memory, per admin session) ────────────────────────────
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

function jsonError(status: number, error: string, headers?: Record<string, string>) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// ─── Creative images (Meta CDN) ─────────────────────────────────────────────
interface DownloadedImage {
  base64: string;
  mediaType: ImageMediaType;
}

/**
 * Rewriting one variant re-sends the same creatives: keep their encoded
 * bytes in this process briefly (LRU, size-capped) so a burst of rewrites
 * doesn't re-download every image from the CDN.
 */
const IMAGE_CACHE_TTL_MS = 10 * 60_000;
const IMAGE_CACHE_MAX_CHARS = 48 * 1024 * 1024;
const imageCache = new Map<string, { image: DownloadedImage; at: number }>();
let imageCacheChars = 0;

function dropCachedImage(url: string) {
  const hit = imageCache.get(url);
  if (!hit) return;
  imageCache.delete(url);
  imageCacheChars -= hit.image.base64.length;
}

function cachedImage(url: string): DownloadedImage | null {
  const hit = imageCache.get(url);
  if (!hit) return null;
  dropCachedImage(url);
  if (Date.now() - hit.at > IMAGE_CACHE_TTL_MS) return null;
  imageCache.set(url, hit); // re-insert = most recently used
  imageCacheChars += hit.image.base64.length;
  return hit.image;
}

function rememberImage(url: string, image: DownloadedImage) {
  dropCachedImage(url);
  imageCache.set(url, { image, at: Date.now() });
  imageCacheChars += image.base64.length;
  for (const key of Array.from(imageCache.keys())) {
    if (imageCacheChars <= IMAGE_CACHE_MAX_CHARS) break;
    dropCachedImage(key);
  }
}

/**
 * Download a creative's image for vision. The URL comes from the client's
 * copy of Meta data, so it's only fetched when it's an https Meta-CDN URL —
 * every redirect hop included — through lib/publicImageFetch (connect-time
 * private-IP guard, 10 s, byte cap); the bytes are sniffed — Claude rejects a
 * media_type that doesn't match the data.
 */
async function downloadCreativeImage(url: string): Promise<DownloadedImage | null> {
  if (!isMetaImageUrl(url)) return null;
  const cached = cachedImage(url);
  if (cached) return cached;
  const res = await fetchPublicImage(url, GENERATE_LIMITS.imageBytes, { allowHost: (u) => isMetaImageUrl(u.href) });
  if (!res.ok) return null;
  const mediaType = sniffImageType(res.data.subarray(0, 16));
  if (!mediaType) return null;
  const image = { base64: res.data.toString("base64"), mediaType };
  rememberImage(url, image);
  return image;
}

// ─── Prompt assembly ────────────────────────────────────────────────────────
async function buildUserContent(req: GenerateRequest): Promise<{
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  imagesSkipped: number;
}> {
  const downloads = await Promise.all(
    req.creatives.map((c) => (c.imageUrl ? downloadCreativeImage(c.imageUrl).catch(() => null) : Promise.resolve(null)))
  );
  const imageCount = req.uploads.length + downloads.filter(Boolean).length;
  let imagesSkipped = 0;

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    { type: "text", text: campaignContextText(req.campaign, imageCount) },
  ];

  // Uploaded originals first — they're the high-resolution source of truth.
  req.uploads.forEach((u, i) => {
    content.push({ type: "image", source: { type: "base64", media_type: u.mediaType, data: u.base64 } });
    content.push({ type: "text", text: uploadLabelText(i, u.name) });
  });

  req.creatives.forEach((c, i) => {
    const img = downloads[i];
    if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
    else if (c.imageUrl) imagesSkipped++;
    const state = img ? "attached" : c.imageUrl ? "missing" : "none";
    content.push({ type: "text", text: creativeText(req.uploads.length + i, c, state) });
  });

  // Breakpoint 2: everything above is identical for every request on the same
  // selection, so "regenerate one variant" re-reads the images from cache.
  content.push({ type: "text", text: END_OF_MATERIAL, cache_control: { type: "ephemeral" } });
  content.push({ type: "text", text: taskText(req.settings, req.mode) });
  return { content, imagesSkipped };
}

// ─── Error mapping (typed SDK classes, never message matching) ─────────────
function describeError(err: unknown): { code: AdCopyErrorCode; message: string } {
  if (err instanceof Anthropic.APIUserAbortError) return { code: "aborted", message: "Stopped." };
  if (err instanceof Anthropic.RateLimitError) {
    return { code: "rate_limited", message: "Claude is handling too many requests right now — try again in a minute." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { code: "upstream", message: "Couldn't reach Claude — check the connection and try again." };
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || (err.status !== undefined && err.status >= 500)) {
      return { code: "overloaded", message: "Claude is temporarily overloaded — try again in a moment." };
    }
    if (err.status === 400 || err.status === 413) {
      return { code: "upstream", message: "Claude couldn't accept this request — try fewer or smaller images." };
    }
    return { code: "upstream", message: "The AI service rejected the request. Ask an admin to check the API key." };
  }
  return { code: "upstream", message: "Generation failed unexpectedly. Try again." };
}

const REFUSAL_HINT: Record<string, string> = {
  bio: "It read the request as sensitive biology content — this can happen with peptide or supplement products.",
  cyber: "It read the request as security-sensitive content.",
  reasoning_extraction: "The notes asked it to show its internal reasoning — remove that instruction.",
};

function refusalMessage(category: string | null | undefined): string {
  const hint = category ? REFUSAL_HINT[category] : undefined;
  return [
    "Claude declined to write copy for this request.",
    hint ?? "",
    "Rephrase or shorten the notes in the brief, or try different creatives.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Route ──────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) return jsonError(401, "Unauthorized");

  if (!checkRateLimit(session.adminId)) {
    return jsonError(429, "Too many requests. Please wait before generating again.", { "Retry-After": "60" });
  }

  const body = await readJsonCapped(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === "too_large"
      ? jsonError(413, "Images are too large to send — remove some uploads and try again.")
      : jsonError(400, "Invalid request body");
  }
  const parsed = parseGenerateRequest(body.value);
  if (!parsed.ok) return jsonError(400, parsed.error);
  const req = parsed.value;

  const model: ChatModelId =
    req.model && ALLOWED_MODELS.includes(req.model as ChatModelId) ? (req.model as ChatModelId) : DEFAULT_MODEL;

  // Aborts the Claude stream when the browser disconnects (Stop / tab closed)
  // — before, the upstream generation kept running (and billing) to the end.
  const upstream = new AbortController();
  const onClientAbort = () => upstream.abort();
  request.signal.addEventListener("abort", onClientAbort);

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AdCopyStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          closed = true;
        }
      };

      try {
        send({ t: "status", phase: "images" });
        const { content, imagesSkipped } = await buildUserContent(req);
        if (upstream.signal.aborted) throw new Anthropic.APIUserAbortError();

        const stream = anthropic.beta.messages.stream(
          {
            model,
            max_tokens: MAX_TOKENS,
            thinking: { type: "adaptive", display: "summarized" },
            output_config: {
              effort: AD_COPY_EFFORT,
              format: { type: "json_schema", schema: AD_COPY_JSON_SCHEMA },
            },
            system: [{ type: "text", text: AD_COPY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content }],
            betas: [FALLBACK_BETA],
            fallbacks: "default",
          },
          { signal: upstream.signal }
        );

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "thinking") send({ t: "status", phase: "thinking" });
            else if (block.type === "text") send({ t: "status", phase: "writing" });
            else if (block.type === "fallback") send({ t: "fallback", from: block.from.model, to: block.to.model });
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") send({ t: "text", text: event.delta.text });
            else if (event.delta.type === "thinking_delta") send({ t: "thinking", text: event.delta.thinking });
          }
        }

        const final = await stream.finalMessage();
        const u = final.usage;
        console.info(
          `[ad-copy] ${final.model} stop=${final.stop_reason} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} mode=${req.mode.kind}`
        );

        // Check refusal BEFORE reading content (a mid-stream decline leaves partial text).
        if (final.stop_reason === "refusal") {
          const category = final.stop_details?.category ?? null;
          send({ t: "error", code: "refusal", message: refusalMessage(category), category });
          return;
        }

        // After a mid-stream fallback the reply continues across text blocks — join them in order.
        const text = final.content.map((b) => (b.type === "text" ? b.text : "")).join("");
        const result = parseAdCopy(text);
        if (!result) {
          send(
            final.stop_reason === "max_tokens"
              ? { t: "error", code: "max_tokens", message: "The reply was cut off. Ask for fewer or shorter variants and try again." }
              : { t: "error", code: "bad_output", message: "Claude's reply couldn't be read. Try again." }
          );
          return;
        }
        send({ t: "done", result, imagesSkipped, model: final.model });
      } catch (err) {
        const { code, message } = describeError(err);
        if (code !== "aborted") console.error("[ad-copy] generation failed:", err instanceof Error ? err.message : err);
        send({ t: "error", code, message });
      } finally {
        request.signal.removeEventListener("abort", onClientAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by a cancel
          }
        }
      }
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
