export const dynamic = "force-dynamic";

import { GoogleGenAI } from "@google/genai";
import { getAdminSession } from "@/lib/adminSession";
import {
  getGenerationPrompt,
  computeJsonDiff,
  ALLOWED_USE_CASES,
  type UseCase,
} from "@/lib/jsonEditorPrompts";
import {
  ALLOWED_GEMINI_MODELS,
  type GeminiImageModelId,
} from "@/lib/geminiModels";

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
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_JSON_CHARS = 500_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_RESOLUTIONS = new Set(["1K", "2K", "4K"]);
const VALID_RESPONSE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  // ── Auth + permission check ──────────────────────────────────────────────
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  if (!session.isSuper && !session.permissions?.jsoneditor) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  if (!checkRateLimit(session.adminId)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before sending another request." }),
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Image generation is not configured" }),
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();

    // ── Source image ────────────────────────────────────────────────────────
    const imageFile = formData.get("image");
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      return new Response(JSON.stringify({ error: "Source image is required" }), { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      return new Response(JSON.stringify({ error: "Unsupported image type" }), { status: 400 });
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: "Source image exceeds 10 MB limit" }), { status: 400 });
    }

    // ── JSON payloads (with size limit) ────────────────────────────────────
    const originalJson = formData.get("originalJson");
    const modifiedJson = formData.get("modifiedJson");
    if (typeof originalJson !== "string" || typeof modifiedJson !== "string") {
      return new Response(
        JSON.stringify({ error: "Both originalJson and modifiedJson are required" }),
        { status: 400 },
      );
    }
    if (originalJson.length > MAX_JSON_CHARS || modifiedJson.length > MAX_JSON_CHARS) {
      return new Response(
        JSON.stringify({ error: "JSON payload exceeds size limit" }),
        { status: 413 },
      );
    }

    let parsedOriginal: Record<string, unknown>;
    let parsedModified: Record<string, unknown>;
    try {
      parsedOriginal = JSON.parse(originalJson);
      parsedModified = JSON.parse(modifiedJson);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in originalJson or modifiedJson" }),
        { status: 400 },
      );
    }

    // ── Use case ───────────────────────────────────────────────────────────
    const useCaseRaw = formData.get("useCase");
    if (typeof useCaseRaw !== "string" || !ALLOWED_USE_CASES.includes(useCaseRaw as UseCase)) {
      return new Response(JSON.stringify({ error: "Invalid use case" }), { status: 400 });
    }
    const useCase = useCaseRaw as UseCase;

    // ── Model ──────────────────────────────────────────────────────────────
    const modelRaw = formData.get("model");
    const model: GeminiImageModelId =
      typeof modelRaw === "string" && ALLOWED_GEMINI_MODELS.includes(modelRaw as GeminiImageModelId)
        ? (modelRaw as GeminiImageModelId)
        : "gemini-3.1-flash-image-preview";

    // ── Resolution ─────────────────────────────────────────────────────────
    const resolutionRaw = formData.get("resolution");
    const isImagenModel = model.startsWith("imagen");
    const resolution =
      typeof resolutionRaw === "string" && ALLOWED_RESOLUTIONS.has(resolutionRaw)
        ? resolutionRaw
        : undefined;
    const effectiveResolution = isImagenModel ? undefined : (resolution ?? "4K");

    // ── Compute diff ───────────────────────────────────────────────────────
    const changes = computeJsonDiff(parsedOriginal, parsedModified);
    if (changes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No changes detected between original and modified JSON" }),
        { status: 400 },
      );
    }

    // ── Build prompt ───────────────────────────────────────────────────────
    const prompt = getGenerationPrompt(useCase, originalJson, modifiedJson, changes);

    // ── Build parts: source image + optional reference + prompt ────────────
    type InlinePart = { inlineData: { mimeType: string; data: string } };
    type TextPart = { text: string };
    const parts: (InlinePart | TextPart)[] = [];

    const imageBytes = await imageFile.arrayBuffer();
    parts.push({
      inlineData: {
        mimeType: imageFile.type,
        data: Buffer.from(imageBytes).toString("base64"),
      },
    });

    // Optional reference image (for object-swap, camera perspective)
    const refFile = formData.get("referenceImage");
    if (refFile instanceof File && refFile.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(refFile.type)) {
        return new Response(JSON.stringify({ error: "Unsupported reference image type" }), { status: 400 });
      }
      if (refFile.size > MAX_IMAGE_BYTES) {
        return new Response(JSON.stringify({ error: "Reference image exceeds 10 MB limit" }), { status: 400 });
      }
      const refBytes = await refFile.arrayBuffer();
      parts.push({
        inlineData: {
          mimeType: refFile.type,
          data: Buffer.from(refBytes).toString("base64"),
        },
      });
    }

    parts.push({ text: prompt });

    // ── Generate with Gemini (single-turn) ────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    if (effectiveResolution) {
      config.imageConfig = { imageSize: effectiveResolution };
    }

    const result = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config,
    });

    // ── Parse response ─────────────────────────────────────────────────────
    let responseText: string | null = null;
    let responseImageBase64: string | null = null;
    let responseMimeType: string | null = null;

    for (const part of result.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) responseText = (responseText ?? "") + part.text;
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? "image/png";
        responseImageBase64 = part.inlineData.data;
        responseMimeType = VALID_RESPONSE_MIMES.has(mime) ? mime : "image/png";
      }
    }

    if (!responseImageBase64) {
      if (responseText) console.error("[json-editor/generate] Gemini returned text only:", responseText);
      return new Response(
        JSON.stringify({ error: "Image generation failed — no image returned" }),
        { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
      );
    }

    return new Response(
      JSON.stringify({
        imageBase64: responseImageBase64,
        mimeType: responseMimeType,
        text: responseText,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[json-editor/generate] API error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
