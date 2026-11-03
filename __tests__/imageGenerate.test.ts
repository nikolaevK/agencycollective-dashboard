import { describe, expect, it } from "vitest";
import { ApiError, type Content, type GenerateContentResponse } from "@google/genai";
import {
  ALLOWED_GEMINI_MODELS,
  DEFAULT_GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_MODELS,
  clampImageSize,
  geminiImageConfig,
  geminiImageModelInfo,
  isAspectRatioFor,
  resolveGeminiImageModel,
} from "@/lib/geminiModels";
import {
  HISTORY_BUDGET_BYTES,
  GEMINI_INLINE_REQUEST_LIMIT,
  MAX_BODY_BYTES,
  RETRY_WINDOW_MS,
  contentBytes,
  describeGeminiError,
  googleErrorDetail,
  historyBytes,
  parseImageResponse,
  shouldRetryGemini,
  sniffUploadType,
  trimHistory,
} from "@/app/api/generate/geminiResult";
import { ConversationStore } from "@/app/api/generate/conversations";
import {
  GenerateRequestError,
  base64ToBlob,
  base64ToBytes,
  describeHttpFailure,
  formatBytes,
  formatElapsed,
  imageFileName,
  readBlobImageSize,
  readGenerateResponse,
  readImageSize,
} from "@/components/generate/generateClient";
import { fitWithin, geminiTypeOf, perImageBudget, UPLOAD_BUDGET_BYTES } from "@/components/generate/imagePrep";
import { prunableImageIds } from "@/components/generate/imageStore";
import { DEFAULT_SETTINGS, normalizeSession } from "@/hooks/useImageGeneratorSession";

// ─── Model registry ───────────────────────────────────────────────────────────

describe("geminiModels", () => {
  it("lists only live models and keeps the shared export names", () => {
    expect(ALLOWED_GEMINI_MODELS).toEqual(GEMINI_IMAGE_MODELS.map((m) => m.id));
    expect(ALLOWED_GEMINI_MODELS).toContain(DEFAULT_GEMINI_IMAGE_MODEL);
    expect(ALLOWED_GEMINI_MODELS).not.toContain("gemini-3.1-flash-image-preview");
    expect(ALLOWED_GEMINI_MODELS.some((id) => id.startsWith("imagen"))).toBe(false);
  });

  it("maps retired ids to their replacement and anything else to the default", () => {
    expect(resolveGeminiImageModel("gemini-3-pro-image")).toBe("gemini-3-pro-image");
    expect(resolveGeminiImageModel("gemini-3.1-flash-image-preview")).toBe("gemini-nano-banana-2.1");
    expect(resolveGeminiImageModel("gemini-2.0-flash-preview-image-generation")).toBe("gemini-nano-banana-2.1");
    expect(resolveGeminiImageModel("imagen-3.0-generate-002")).toBe("gemini-3-pro-image");
    expect(resolveGeminiImageModel("gpt-image-1")).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
    expect(resolveGeminiImageModel("toString")).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
    expect(resolveGeminiImageModel(null)).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
  });

  it("never returns an undefined registry entry", () => {
    expect(geminiImageModelInfo("gemini-3.1-flash-image-preview").label).toBe("Nano Banana 2.1");
    expect(geminiImageModelInfo(undefined).id).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
  });

  it("clamps sizes to what the model renders", () => {
    expect(clampImageSize("gemini-nano-banana-2.1", "2K")).toBe("2K");
    expect(clampImageSize("gemini-nano-banana-2.1", "512")).toBe("1K");
    expect(clampImageSize("gemini-3.1-flash-image", "512")).toBe("512");
    expect(clampImageSize("gemini-3.1-flash-lite-image", "4K")).toBe("1K");
    expect(clampImageSize("gemini-3-pro-image", undefined)).toBe("4K"); // historical default
    expect(clampImageSize("gemini-3-pro-image", "8K")).toBe("4K");
  });

  it("builds imageConfig with only supported fields", () => {
    expect(geminiImageConfig("gemini-nano-banana-2.1", { aspectRatio: "1:8", imageSize: "2K" })).toEqual({
      aspectRatio: "1:8",
      imageSize: "2K",
    });
    // 1:8 is 2.1 / 3.1 Flash only; Pro drops it (model decides).
    expect(geminiImageConfig("gemini-3-pro-image", { aspectRatio: "1:8", imageSize: "1K" })).toEqual({ imageSize: "1K" });
    expect(isAspectRatioFor("gemini-3-pro-image", "4:5")).toBe(true);
    expect(isAspectRatioFor("gemini-3-pro-image", 45)).toBe(false);
  });
});

// ─── Route helpers ────────────────────────────────────────────────────────────

const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const GIF_HEAD = new TextEncoder().encode("GIF89a......");
const WEBP_HEAD = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

describe("sniffUploadType", () => {
  it("trusts magic bytes, not the declared type", () => {
    expect(sniffUploadType(PNG_HEAD)).toBe("image/png");
    expect(sniffUploadType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffUploadType(WEBP_HEAD)).toBe("image/webp");
    // Gemini can't read GIF — the browser converts it first.
    expect(sniffUploadType(GIF_HEAD)).toBeNull();
    expect(sniffUploadType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  });
});

function turn(role: "user" | "model", bytes: number): Content {
  return { role, parts: [{ inlineData: { mimeType: "image/png", data: "a".repeat(bytes) } }] };
}

describe("history budget", () => {
  it("leaves room for a max-size user turn under Gemini's request cap", () => {
    expect(HISTORY_BUDGET_BYTES + Math.ceil((MAX_BODY_BYTES * 4) / 3)).toBeLessThan(GEMINI_INLINE_REQUEST_LIMIT);
  });

  it("drops whole oldest turns until the history fits", () => {
    const history = [turn("user", 100), turn("model", 1000), turn("user", 100), turn("model", 1000)];
    const perTurn = contentBytes(history[0]) + contentBytes(history[1]);
    expect(trimHistory(history, perTurn * 2)).toHaveLength(4);
    const trimmed = trimHistory(history, perTurn + 10);
    expect(trimmed).toHaveLength(2);
    expect(trimmed?.[0]).toBe(history[2]);
  });

  it("returns null when the latest turn alone is over budget", () => {
    expect(trimHistory([turn("user", 10), turn("model", 5000)], 1000)).toBeNull();
    expect(trimHistory([], 1000)).toEqual([]);
  });
});

function response(partial: Partial<GenerateContentResponse>): GenerateContentResponse {
  return partial as GenerateContentResponse;
}

describe("parseImageResponse", () => {
  it("returns final text + every image, skipping thought parts, and keeps the model turn intact", () => {
    const content = {
      role: "model",
      parts: [
        { text: "planning", thought: true },
        { inlineData: { mimeType: "image/png", data: "draft" }, thought: true },
        { text: "Here you go." },
        { inlineData: { mimeType: "image/png", data: "AAA" }, thoughtSignature: "sig" },
        { inlineData: { mimeType: "image/jpeg", data: "BBB" } },
      ],
    };
    const parsed = parseImageResponse(response({ candidates: [{ content, finishReason: "STOP" as never }] }));
    expect(parsed.text).toBe("Here you go.");
    expect(parsed.images).toEqual([
      { mimeType: "image/png", data: "AAA" },
      { mimeType: "image/jpeg", data: "BBB" },
    ]);
    expect(parsed.notice).toBeNull();
    expect(parsed.blocked).toBe(false);
    expect(parsed.modelContent?.parts).toBe(content.parts); // unchanged — signatures included
  });

  it("explains safety blocks of the prompt and of the output", () => {
    const prompt = parseImageResponse(response({ promptFeedback: { blockReason: "SAFETY" as never } }));
    expect(prompt.blocked).toBe(true);
    expect(prompt.images).toHaveLength(0);
    expect(prompt.notice).toMatch(/blocked/);

    const output = parseImageResponse(
      response({ candidates: [{ content: { role: "model", parts: [] }, finishReason: "IMAGE_SAFETY" as never }] })
    );
    expect(output.blocked).toBe(true);
    expect(output.modelContent).toBeNull();
  });

  it("says why there's no image when the model only talked", () => {
    const parsed = parseImageResponse(
      response({
        candidates: [{ content: { role: "model", parts: [{ text: "Which style?" }] }, finishReason: "STOP" as never }],
      })
    );
    expect(parsed.text).toBe("Which style?");
    expect(parsed.notice).toBeNull(); // a question is a valid turn
    const none = parseImageResponse(
      response({ candidates: [{ content: { role: "model", parts: [] }, finishReason: "NO_IMAGE" as never }] })
    );
    expect(none.notice).toMatch(/didn't produce an image/);
  });

  it("keeps http(s) grounding sources only, de-duplicated", () => {
    const parsed = parseImageResponse(
      response({
        candidates: [
          {
            content: { role: "model", parts: [{ inlineData: { mimeType: "image/png", data: "A" } }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: "https://example.com/a", title: "Example" } },
                { web: { uri: "https://example.com/a", title: "Dup" } },
                { web: { uri: "javascript:alert(1)", title: "x" } },
              ],
            },
          },
        ],
      })
    );
    expect(parsed.sources).toEqual([{ uri: "https://example.com/a", title: "Example" }]);
  });

  it("normalizes unknown output types to PNG", () => {
    const parsed = parseImageResponse(
      response({ candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: "image/heic", data: "A" } }] } }] })
    );
    expect(parsed.images[0].mimeType).toBe("image/png");
  });
});

describe("describeGeminiError", () => {
  const apiError = (status: number, message = "boom") =>
    new ApiError({ status, message: JSON.stringify({ error: { code: status, message, status: "X" } }) });

  it("maps SDK statuses to stable codes", () => {
    expect(describeGeminiError(apiError(429))).toMatchObject({ status: 429, code: "upstream_rate_limited" });
    expect(describeGeminiError(apiError(403))).toMatchObject({ code: "not_configured" });
    expect(describeGeminiError(apiError(404))).toMatchObject({ code: "model_unavailable" });
    expect(describeGeminiError(apiError(503))).toMatchObject({ status: 503, code: "upstream_unavailable" });
    const bad = describeGeminiError(apiError(400, "Unsupported aspect ratio"));
    expect(bad).toMatchObject({ status: 422, code: "upstream_error" });
    expect(bad.message).toContain("Unsupported aspect ratio");
  });

  it("recognizes aborts, the SDK's timeout and network failures", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(describeGeminiError(abort).aborted).toBe(true);
    // An abort the caller didn't make is httpOptions.timeout firing.
    expect(describeGeminiError(abort, { cancelled: false })).toMatchObject({
      aborted: false,
      status: 504,
      code: "upstream_unavailable",
    });
    expect(describeGeminiError(new TypeError("fetch failed"))).toMatchObject({ code: "upstream_unavailable" });
    expect(describeGeminiError(new Error("?"))).toMatchObject({ status: 500, code: "internal" });
  });

  it("extracts Google's message from the SDK error body", () => {
    expect(googleErrorDetail(apiError(400, "Bad thing"))).toBe("Bad thing");
    expect(googleErrorDetail(new ApiError({ status: 400, message: "plain" }))).toBe("plain");
  });
});

describe("shouldRetryGemini", () => {
  const status = (code: number) => new ApiError({ status: code, message: "{}" });
  const network = (message: string, code: string) => new TypeError(message, { cause: { code } });

  it("retries an overloaded Gemini or a connection that never opened — when it failed fast", () => {
    expect(shouldRetryGemini(status(503), 1_000)).toBe(true);
    expect(shouldRetryGemini(status(500), 1_000)).toBe(true);
    expect(shouldRetryGemini(status(408), 1_000)).toBe(true);
    expect(shouldRetryGemini(network("fetch failed", "ECONNREFUSED"), 50)).toBe(true);
    expect(shouldRetryGemini(network("fetch failed", "UND_ERR_CONNECT_TIMEOUT"), 50)).toBe(true);
    // A slow failure may come after the render was billed.
    expect(shouldRetryGemini(status(503), RETRY_WINDOW_MS)).toBe(false);
  });

  it("never retries quota, bad requests, timeouts or a download cut short", () => {
    expect(shouldRetryGemini(status(429), 1_000)).toBe(false);
    expect(shouldRetryGemini(status(400), 1_000)).toBe(false);
    expect(shouldRetryGemini(network("terminated", "UND_ERR_SOCKET"), 1_000)).toBe(false);
    expect(shouldRetryGemini(network("terminated", "ECONNRESET"), 1_000)).toBe(false);
    expect(shouldRetryGemini(network("fetch failed", "UND_ERR_HEADERS_TIMEOUT"), 1_000)).toBe(false);
    expect(shouldRetryGemini(new TypeError("fetch failed"), 1_000)).toBe(false);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(shouldRetryGemini(abort, 1_000)).toBe(false);
  });
});

describe("ConversationStore", () => {
  const opts = { ttlMs: 1000, maxTotal: 3, maxPerAdmin: 2, maxBytes: Infinity };

  it("finds only the owner's conversation for the same model", () => {
    const store = new ConversationStore(opts, () => 0);
    store.create("c1", "a1", "m1", []);
    expect(store.lookup("c1", "a1", "m1").ok).toBe(true);
    expect(store.lookup("c1", "a2", "m1")).toEqual({ ok: false, code: "conversation_expired" });
    expect(store.lookup("c1", "a1", "m2")).toEqual({ ok: false, code: "conversation_expired" });
    expect(store.lookup("nope", "a1", "m1")).toEqual({ ok: false, code: "conversation_expired" });
  });

  it("expires idle conversations but never one in flight", () => {
    let now = 0;
    const store = new ConversationStore(opts, () => now);
    const busy = store.create("busy", "a1", "m", []);
    store.create("idle", "a2", "m", []);
    store.begin(busy);
    now = 5000;
    expect(store.lookup("idle", "a2", "m").ok).toBe(false);
    expect(store.lookup("busy", "a1", "m")).toEqual({ ok: false, code: "conversation_busy" });
    store.end(busy);
    expect(store.lookup("busy", "a1", "m").ok).toBe(true);
  });

  it("caps conversations per admin and per instance (oldest first)", () => {
    let now = 0;
    const store = new ConversationStore(opts, () => now++);
    store.create("a", "a1", "m", []);
    store.create("b", "a1", "m", []);
    store.create("c", "a1", "m", []);
    expect(store.lookup("a", "a1", "m").ok).toBe(false);
    expect(store.lookup("c", "a1", "m").ok).toBe(true);
    store.create("d", "a2", "m", []);
    store.create("e", "a3", "m", []);
    expect(store.size).toBe(3);
  });

  it("caps total history bytes, evicting the least recently used idle conversation", () => {
    let now = 0;
    const history = [turn("user", 10), turn("model", 1000)];
    const store = new ConversationStore({ ...opts, maxTotal: 10, maxPerAdmin: 10, maxBytes: historyBytes(history) * 2 }, () => now++);
    const a = store.create("a", "a1", "m", history);
    store.create("b", "a2", "m", history);
    store.begin(a); // in flight — never evicted
    store.create("c", "a3", "m", history);
    expect(store.lookup("b", "a2", "m").ok).toBe(false);
    expect(store.lookup("c", "a3", "m").ok).toBe(true);
    // A turn that grows a history re-applies the cap too.
    store.setHistory(a, [...history, ...history]);
    expect(store.lookup("c", "a3", "m").ok).toBe(false);
    expect(a.history).toHaveLength(4);
  });
});

// ─── Client helpers ───────────────────────────────────────────────────────────

function ndjsonResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8" } }
  );
}

const RESULT = {
  text: null,
  images: [{ mimeType: "image/png", data: "QUJD" }],
  conversationId: "c1",
  model: "gemini-nano-banana-2.1",
  imageSize: "4K",
  aspectRatio: null,
  notice: null,
  sources: [],
};

describe("readGenerateResponse", () => {
  it("reports progress and resolves the result line, even when split across chunks", async () => {
    const line = JSON.stringify({ type: "result", result: RESULT }) + "\n";
    const stages: string[] = [];
    const result = await readGenerateResponse(
      ndjsonResponse([
        '{"type":"status","stage":"generating"}\n{"type":"pi',
        'ng"}\n',
        line.slice(0, 20),
        line.slice(20),
      ]),
      (e) => stages.push(e.type)
    );
    expect(result).toEqual(RESULT);
    expect(stages).toEqual(["status", "ping"]);
  });

  it("throws the stream's error line", async () => {
    await expect(
      readGenerateResponse(
        ndjsonResponse(['{"type":"error","error":"Blocked","code":"blocked","status":422}\n'])
      )
    ).rejects.toMatchObject({ message: "Blocked", code: "blocked", status: 422 });
  });

  it("treats a stream that ends without a result as incomplete", async () => {
    await expect(readGenerateResponse(ndjsonResponse(['{"type":"ping"}\n']))).rejects.toMatchObject({
      code: "incomplete",
    });
  });

  it("reads JSON errors and survives non-JSON platform errors", async () => {
    const json = new Response(JSON.stringify({ error: "Slow down", code: "rate_limited", retryAfter: 12 }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
    await expect(readGenerateResponse(json)).rejects.toMatchObject({ code: "rate_limited", retryAfter: 12 });

    const vercel413 = new Response("Request Entity Too Large", { status: 413, headers: { "content-type": "text/plain" } });
    const err = await readGenerateResponse(vercel413).catch((e) => e);
    expect(err).toBeInstanceOf(GenerateRequestError);
    expect(err.code).toBe("too_large");
  });

  it("describes bare HTTP failures", () => {
    expect(describeHttpFailure(504, null, null).message).toMatch(/timed out/);
    expect(describeHttpFailure(429, null, "30").retryAfter).toBe(30);
    expect(describeHttpFailure(418, null, null).message).toBe("Request failed (HTTP 418).");
  });
});

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("readImageSize", () => {
  it("reads PNG", () => {
    expect(readImageSize(png(4096, 2304))).toEqual({ width: 4096, height: 2304 });
  });

  it("reads JPEG past APP segments", () => {
    const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x00, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0];
    expect(readImageSize(Uint8Array.from([0xff, 0xd8, ...app0, ...sof0]))).toEqual({ width: 800, height: 1280 });
  });

  it("reads WebP lossy, lossless and extended", () => {
    const head = (chunk: string) => {
      const b = new Uint8Array(30);
      b.set(new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}`));
      return b;
    };
    const vp8x = head("VP8X");
    vp8x.set([0xff, 0x0f, 0x00, 0x7f, 0x07, 0x00], 24); // 4096 × 1920
    expect(readImageSize(vp8x)).toEqual({ width: 4096, height: 1920 });

    const vp8l = head("VP8L");
    vp8l.set([0x2f, 0x63, 0x40, 0x0c, 0x00], 20); // 100 × 50
    expect(readImageSize(vp8l)).toEqual({ width: 100, height: 50 });

    const vp8 = head("VP8 ");
    vp8.set([0x00, 0x04, 0x00, 0x03], 26); // 1024 × 768
    expect(readImageSize(vp8)).toEqual({ width: 1024, height: 768 });
  });

  it("returns null for anything else", () => {
    expect(readImageSize(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});

describe("small client helpers", () => {
  it("decodes base64", async () => {
    expect(Array.from(base64ToBytes("QUJD"))).toEqual([65, 66, 67]);
    const blob = await base64ToBlob("QUJD", "image/png");
    expect(blob.type).toBe("image/png");
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([65, 66, 67]);
  });

  it("reads the pixel size from the start of a Blob", async () => {
    const big = new Uint8Array(1024 * 1024);
    big.set(png(4096, 2304));
    expect(await readBlobImageSize(new Blob([big]))).toEqual({ width: 4096, height: 2304 });
  });

  it("passes only real PNG / JPEG / WebP bytes through as is, whatever the file says", () => {
    expect(geminiTypeOf(PNG_HEAD)).toBe("image/png");
    expect(geminiTypeOf(WEBP_HEAD)).toBe("image/webp");
    // An AVIF / HEIC renamed .jpg is re-encoded instead.
    expect(geminiTypeOf(new TextEncoder().encode("\0\0\0\x1cftypavif"))).toBeNull();
    expect(geminiTypeOf(new TextEncoder().encode("\0\0\0\x18ftypheic"))).toBeNull();
  });

  it("names downloads after the prompt", () => {
    const when = new Date(2026, 10, 2, 15, 30);
    expect(imageFileName("A cinematic sunset over mountain peaks!", "image/png", when)).toBe(
      "a-cinematic-sunset-over-mountain-peaks-20261102-1530.png"
    );
    expect(imageFileName(null, "image/jpeg", when, 1)).toBe("generated-image-20261102-1530-2.jpg");
    expect(imageFileName("Café ☕", "image/webp", when)).toBe("cafe-20261102-1530.webp");
  });

  it("formats sizes and timers", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(13_000_000)).toBe("12.4 MB");
    expect(formatElapsed(83_400)).toBe("1:23");
  });

  it("fits images and splits the upload budget", () => {
    expect(fitWithin(4096, 2048, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(perImageBudget(0)).toBe(UPLOAD_BUDGET_BYTES);
    expect(perImageBudget(5) * 5).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
    // Multipart overhead + prompt still fit under Vercel's cap.
    expect(UPLOAD_BUDGET_BYTES).toBeLessThan(MAX_BODY_BYTES - 256 * 1024);
  });
});

describe("prunableImageIds", () => {
  const HOUR = 60 * 60 * 1000;
  const now = 100 * HOUR;
  const rec = (id: string, ageMs: number) => ({ id, savedAt: now - ageMs });

  it("drops aged records, then the oldest beyond the cap", () => {
    const unkept = [rec("fresh-ish", 2 * HOUR), rec("old", 5 * HOUR), rec("ancient", 50 * HOUR)];
    expect(prunableImageIds(unkept, 0, now, 24 * HOUR, 10)).toEqual(["ancient"]);
    expect(prunableImageIds(unkept, 1, now, 24 * HOUR, 2)).toEqual(["ancient", "old"]);
  });

  it("never takes a record from the last hour for the cap — it may be another tab's", () => {
    const unkept = [rec("a", 10 * 60 * 1000), rec("b", 5 * 60 * 1000)];
    expect(prunableImageIds(unkept, 80, now, 24 * HOUR, 80)).toEqual([]);
  });
});

describe("normalizeSession", () => {
  it("migrates a v1 session (inline base64, top-level settings, retired model)", () => {
    const { state, legacy } = normalizeSession({
      messages: [
        { id: "u1", role: "user", text: "cat", imageBase64: null, mimeType: null },
        { id: "a1", role: "assistant", text: null, imageBase64: "QUJD", mimeType: "image/png" },
      ],
      conversationId: "conv",
      mode: "single-turn",
      model: "gemini-3.1-flash-image-preview",
      resolution: "2K",
    });
    expect(state.settings).toMatchObject({ mode: "single-turn", model: "gemini-nano-banana-2.1", resolution: "2K" });
    expect(state.conversation).toEqual({ id: "conv", model: "gemini-nano-banana-2.1" });
    expect(legacy).toEqual([{ id: "a1-0", mimeType: "image/png", base64: "QUJD" }]);
    expect(state.messages[1].images).toEqual([{ id: "a1-0", mimeType: "image/png", bytes: 3 }]);
    expect("imageBase64" in state.messages[1]).toBe(false);
  });

  it("rebuilds stored messages field by field (nothing unsafe reaches src/href)", () => {
    const { state } = normalizeSession({
      settings: { mode: "multi-turn", model: "gemini-3-pro-image", resolution: "1K", aspectRatio: "4:5", search: false },
      conversation: { id: "c", model: "gemini-3-pro-image" },
      messages: [
        { id: "u", role: "user", text: "x", refThumbs: ["data:image/jpeg;base64,AA", "javascript:alert(1)"], extra: 1 },
        {
          id: "a",
          role: "assistant",
          text: null,
          images: [{ id: "i1", mimeType: "image/png", bytes: 3 }, { nope: true }],
          sources: [{ uri: "https://ok.example", title: null }, { uri: "javascript:alert(1)", title: "x" }],
        },
      ],
    });
    expect(state.settings).toEqual({
      mode: "multi-turn",
      model: "gemini-3-pro-image",
      resolution: "1K",
      aspectRatio: "4:5",
      search: false,
    });
    expect(state.conversation).toEqual({ id: "c", model: "gemini-3-pro-image" });
    expect(state.messages[0].refThumbs).toEqual(["data:image/jpeg;base64,AA"]);
    expect("extra" in state.messages[0]).toBe(false);
    expect(state.messages[1].images).toHaveLength(1);
    expect(state.messages[1].sources).toEqual([{ uri: "https://ok.example", title: null }]);
  });

  it("drops junk and falls back to defaults", () => {
    const { state } = normalizeSession({ messages: [null, { id: 1 }, { id: "x", role: "system" }], settings: "?" });
    expect(state.messages).toEqual([]);
    expect(state.settings.model).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
    expect(normalizeSession("garbage").state.messages).toEqual([]);
  });

  it("records the owning admin (none = an unowned, pre-owner session)", () => {
    expect(normalizeSession({ adminId: "a1", messages: [] }).state.adminId).toBe("a1");
    expect(normalizeSession({ messages: [] }).state.adminId).toBeNull();
    expect(normalizeSession({ adminId: 7 }).state.adminId).toBeNull();
  });

  it("defaults to 2K — a 4K render is too large to keep in multi-turn history", () => {
    expect(DEFAULT_SETTINGS.resolution).toBe("2K");
    expect(normalizeSession({}).state.settings.resolution).toBe("2K");
  });
});
