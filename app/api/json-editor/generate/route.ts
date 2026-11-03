export const dynamic = "force-dynamic";
/** A 4K render on a busy image model can take a few minutes. */
export const maxDuration = 300;

import { ApiError, GoogleGenAI, type GenerateContentConfig, type Part } from "@google/genai";
import { getAdminSession } from "@/lib/adminSession";
import { geminiImageConfig, geminiImageModelInfo, resolveGeminiImageModel } from "@/lib/geminiModels";
import { isUseCase, metaForUseCase } from "@/lib/jsonEditor/useCases";
import { generationPrompt } from "@/lib/jsonEditor/prompts";
import { diffJson, parseJsonObject } from "@/lib/jsonEditor/diff";
import { imageBlockMessage, type JsonEditorErrorCode } from "@/lib/jsonEditor/errors";
import { MAX_JSON_BYTES, MAX_UPLOAD_IMAGE_BYTES, nearestAspectRatio, utf8ByteLength } from "@/lib/jsonEditor/images";
import { fitForResponse, readImageUpload, readUploadForm } from "@/lib/jsonEditor/serverImage";
import { DEFAULT_RESOLUTION } from "@/lib/jsonEditor/models";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

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

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000).unref();

// ─── Input constraints ─────────────────────────────────────────────────────
/** Two images, three JSON documents and a few short fields; a body over this is refused before it's buffered. */
const MAX_REQUEST_BYTES = 2 * MAX_UPLOAD_IMAGE_BYTES + 3 * MAX_JSON_BYTES + 256 * 1024;
const VALID_RESPONSE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function fail(status: number, error: string, code?: JsonEditorErrorCode): Response {
  return json({ error, ...(code ? { code } : {}) }, status);
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

  if (!process.env.GEMINI_API_KEY) return fail(500, "Image generation is not configured");

  const read = await readUploadForm(request, MAX_REQUEST_BYTES);
  if (!read.ok) {
    return read.status === 413
      ? fail(413, "The images and JSON are too large to upload.", "too_large")
      : fail(400, "Expected a multipart form upload");
  }
  const formData = read.form;

  // ── Use case ───────────────────────────────────────────────────────────
  const useCase = formData.get("useCase");
  if (!isUseCase(useCase)) return fail(400, "Invalid use case");
  const { requiresReference } = metaForUseCase(useCase);

  // ── JSON payloads ──────────────────────────────────────────────────────
  const originalJson = formData.get("originalJson");
  const modifiedJson = formData.get("modifiedJson");
  const referenceJsonRaw = formData.get("referenceJson");
  if (typeof originalJson !== "string" || typeof modifiedJson !== "string") {
    return fail(400, "Both originalJson and modifiedJson are required");
  }
  if (
    utf8ByteLength(originalJson) > MAX_JSON_BYTES ||
    utf8ByteLength(modifiedJson) > MAX_JSON_BYTES ||
    (typeof referenceJsonRaw === "string" && utf8ByteLength(referenceJsonRaw) > MAX_JSON_BYTES)
  ) {
    return fail(413, "JSON payload exceeds size limit", "too_large");
  }
  const original = parseJsonObject(originalJson);
  const modified = parseJsonObject(modifiedJson);
  if (!original.ok || !modified.ok) {
    return fail(400, "originalJson and modifiedJson must both be JSON objects");
  }
  const changes = diffJson(original.value, modified.value);
  if (changes.length === 0) {
    return fail(400, "No changes detected between original and modified JSON");
  }

  // ── Model + resolution ─────────────────────────────────────────────────
  // Retired / unknown ids resolve to a live model (lib/geminiModels.ts).
  const model = resolveGeminiImageModel(formData.get("model"));
  // Sizes are clamped to what the model takes (e.g. Lite is 1K-only).
  const resolutionRaw = formData.get("resolution");
  const resolution = typeof resolutionRaw === "string" ? resolutionRaw : DEFAULT_RESOLUTION;

  // ── Images (type sniffed from bytes, EXIF-rotated upright) ─────────────
  const source = await readImageUpload(formData.get("image"), "Source image");
  if (!source.ok) return fail(source.status, source.error, source.status === 413 ? "too_large" : undefined);

  let reference: { buffer: Buffer; type: string } | null = null;
  const refEntry = formData.get("referenceImage");
  if (requiresReference && refEntry instanceof File && refEntry.size > 0) {
    const ref = await readImageUpload(refEntry, "Reference image");
    if (!ref.ok) return fail(ref.status, ref.error, ref.status === 413 ? "too_large" : undefined);
    reference = ref;
  }
  if (useCase === "object-swap" && !reference) {
    return fail(400, "Object swap needs a reference image of the new object");
  }

  let referenceJson: string | null = null;
  if (reference && typeof referenceJsonRaw === "string" && referenceJsonRaw.trim()) {
    const parsedRef = parseJsonObject(referenceJsonRaw);
    if (!parsedRef.ok) return fail(400, "referenceJson must be a JSON object");
    referenceJson = referenceJsonRaw;
  }

  // ── Prompt + parts: source image, optional reference, then the text ───
  const prompt = generationPrompt({
    useCase,
    originalJson,
    modifiedJson,
    changes,
    hasReferenceImage: !!reference,
    referenceJson,
  });
  const parts: Part[] = [
    { inlineData: { mimeType: source.type, data: source.buffer.toString("base64") } },
  ];
  if (reference) {
    parts.push({ inlineData: { mimeType: reference.type, data: reference.buffer.toString("base64") } });
  }
  parts.push({ text: prompt });

  const config: GenerateContentConfig = {
    responseModalities: ["TEXT", "IMAGE"],
    // The user cancelled → stop waiting on Gemini (client-side only: Google
    // still finishes and bills the call, but the function is freed).
    abortSignal: request.signal,
  };
  // The output keeps the source's shape (nearest ratio the model takes) —
  // unset, the model may follow the reference image's shape instead.
  const aspectRatio = nearestAspectRatio(source.width, source.height, geminiImageModelInfo(model).aspectRatios);
  const imageConfig = geminiImageConfig(model, { imageSize: resolution, aspectRatio });
  config.imageConfig = imageConfig;

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config,
    });

    // ── Parse response ─────────────────────────────────────────────────────
    const candidate = result.candidates?.[0];
    let responseText = "";
    let imageBase64: string | null = null;
    let imageMime = "image/png";
    for (const part of candidate?.content?.parts ?? []) {
      // Thought parts (interim reasoning text / draft images) aren't the answer.
      if (part.thought) continue;
      if (part.text) responseText += part.text;
      if (part.inlineData?.data) {
        // The last image part is the final image.
        imageBase64 = part.inlineData.data;
        imageMime = part.inlineData.mimeType ?? "image/png";
      }
    }

    if (!imageBase64) {
      const blocked =
        imageBlockMessage(result.promptFeedback?.blockReason) ?? imageBlockMessage(candidate?.finishReason);
      if (blocked) {
        console.warn("[json-editor/generate] blocked", {
          model,
          blockReason: result.promptFeedback?.blockReason,
          finishReason: candidate?.finishReason,
        });
        return fail(422, blocked, "blocked");
      }
      if (responseText) console.error("[json-editor/generate] text only:", responseText.slice(0, 500));
      const said = responseText.trim().slice(0, 300);
      return fail(
        502,
        said
          ? `The image model replied without an image: “${said}”`
          : "The image model didn't return an image. Try again.",
        "no_image"
      );
    }

    // ── Fit the 4.5 MB response cap (re-encode only when too big) ──────────
    const fitted = await fitForResponse(
      Buffer.from(imageBase64, "base64"),
      VALID_RESPONSE_MIMES.has(imageMime) ? imageMime : "image/png"
    );
    if (!fitted) return fail(502, "The generated image was too large to return. Try a lower resolution.", "too_large");

    return json(
      {
        imageBase64: fitted.data.toString("base64"),
        mimeType: fitted.mimeType,
        text: responseText.trim() || null,
        compressed: fitted.compressed,
        model,
        resolution: imageConfig.imageSize ?? null,
      },
      200
    );
  } catch (err) {
    if (request.signal.aborted) return fail(499, "Cancelled");
    if (err instanceof ApiError) {
      console.error("[json-editor/generate] Gemini error:", err.status, err.message);
      if (err.status === 429) {
        return fail(429, "The image model is busy right now. Try again in a minute.", "upstream_rate_limited");
      }
      if (err.status === 404) {
        return fail(502, "The selected image model isn't available. Pick another model.", "model_unavailable");
      }
      if (err.status >= 500) {
        return fail(503, "The image model is temporarily unavailable. Try again shortly.", "upstream_unavailable");
      }
      return fail(502, "The image model rejected this request. Try a different model or image.");
    }
    console.error("[json-editor/generate] API error:", err);
    return fail(500, "Internal server error");
  }
}
