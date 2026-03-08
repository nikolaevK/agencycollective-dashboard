export const dynamic = "force-dynamic";

import { GoogleGenAI } from "@google/genai";
import { getAdminSession } from "@/lib/adminSession";
import { ALLOWED_GEMINI_MODELS, ALLOWED_MODES, type GeminiImageModelId, type GenerateMode } from "@/lib/geminiModels";

// ─── Server-side chat cache ───────────────────────────────────────────────────
// Stores live chat objects between stateless API calls.
// The SDK maintains full conversation history (including thought_signature for
// generated images) internally — we just call sendMessage() each turn.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChatSession = { chat: any; adminId: string; lastUsed: number };
const chatCache = new Map<string, ChatSession>();
const CHAT_TTL_MS = 30 * 60 * 1000; // 30 min idle TTL

function evictExpiredChats() {
  const now = Date.now();
  chatCache.forEach((entry, id) => {
    if (now - entry.lastUsed > CHAT_TTL_MS) chatCache.delete(id);
  });
}

// ─── Input constraints ────────────────────────────────────────────────────────
const MAX_PROMPT_CHARS    = 4_000;
const MAX_IMAGE_BYTES     = 10 * 1024 * 1024;
const MAX_UPLOADED_IMAGES = 4;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// ─── Aspect ratio / resolution constraints ───────────────────────────────────
const ALLOWED_ASPECT_RATIOS = new Set([
  "1:1", "3:4", "4:3", "9:16", "16:9",
]);
const ALLOWED_RESOLUTIONS = new Set(["1K", "2K", "4K"]);

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS    = 60_000;
const RATE_LIMIT_MAX_GENERATE = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_GENERATE) return false;
  entry.count++;
  return true;
}

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400 });
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  if (!checkRateLimit(session.adminId)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before sending another message." }),
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Image generation is not configured" }), { status: 500 });
  }

  try {
    const formData = await request.formData();

    // ── Model ─────────────────────────────────────────────────────────────────
    const modelRaw = formData.get("model");
    const model: GeminiImageModelId =
      typeof modelRaw === "string" && ALLOWED_GEMINI_MODELS.includes(modelRaw as GeminiImageModelId)
        ? (modelRaw as GeminiImageModelId)
        : "gemini-3.1-flash-image-preview";

    // ── Mode ──────────────────────────────────────────────────────────────────
    const modeRaw = formData.get("mode");
    const mode: GenerateMode =
      typeof modeRaw === "string" && ALLOWED_MODES.includes(modeRaw as GenerateMode)
        ? (modeRaw as GenerateMode)
        : "multi-turn";

    // ── Prompt ────────────────────────────────────────────────────────────────
    const promptRaw = formData.get("prompt");
    if (!promptRaw || typeof promptRaw !== "string" || !promptRaw.trim()) return badRequest("prompt is required");
    const prompt = promptRaw.trim();
    if (prompt.length > MAX_PROMPT_CHARS) return badRequest("Prompt exceeds character limit");

    // ── Optional image config (aspect ratio + resolution) ────────────────────
    const aspectRatioRaw = formData.get("aspectRatio");
    const aspectRatio = typeof aspectRatioRaw === "string" && ALLOWED_ASPECT_RATIOS.has(aspectRatioRaw)
      ? aspectRatioRaw
      : undefined;

    const resolutionRaw = formData.get("resolution");
    const resolution = typeof resolutionRaw === "string" && ALLOWED_RESOLUTIONS.has(resolutionRaw)
      ? resolutionRaw
      : undefined;

    // Imagen 3 sizes are determined by aspectRatio; imageSize is Gemini-only.
    // Default to 4K for all Gemini models when no resolution is explicitly passed.
    const isImagenModel = model.startsWith("imagen");
    const effectiveResolution = isImagenModel ? undefined : (resolution ?? "4K");

    // ── Uploaded reference images ─────────────────────────────────────────────
    type ImagePart = { inlineData: { mimeType: string; data: string } };
    const imageParts: ImagePart[] = [];

    for (const entry of formData.getAll("image").slice(0, MAX_UPLOADED_IMAGES)) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      if (!ALLOWED_IMAGE_TYPES.has(entry.type)) return badRequest(`Unsupported image type "${entry.type}"`);
      if (entry.size > MAX_IMAGE_BYTES) return badRequest(`Image "${entry.name}" exceeds 10 MB`);
      const bytes = await entry.arrayBuffer();
      imageParts.push({ inlineData: { mimeType: entry.type, data: Buffer.from(bytes).toString("base64") } });
    }

    // ── Build message ─────────────────────────────────────────────────────────
    // Multi-turn turn 2+: the client clears uploaded files after each turn, so
    // imageParts will be empty unless the user explicitly uploaded NEW images.
    // When empty, we send just the prompt string — the chat object already holds
    // all prior context (including generated images with thought_signature).
    // When the user explicitly uploads new images, include them as inlineData.
    const message = imageParts.length > 0
      ? [...imageParts, { text: prompt }]
      : prompt;

    // ── Multi-turn: use ai.chats.create() + chat.sendMessage() ───────────────
    if (mode === "multi-turn") {
      evictExpiredChats();

      const conversationIdRaw = formData.get("conversationId");
      const conversationId = typeof conversationIdRaw === "string" ? conversationIdRaw : null;

      // Determine whether we're resuming an existing conversation owned by
      // this admin.  `isResume` is the single source of truth — it is true
      // only when a cached entry exists AND belongs to the current admin.
      const cached = conversationId ? chatCache.get(conversationId) : null;
      const isResume = !!(cached && cached.adminId === session.adminId);

      let chat: ChatSession["chat"];
      let convId: string;

      const hasImageConfig = !!(aspectRatio || effectiveResolution);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: any;

      if (isResume) {
        // ── Turn 2+: resume existing conversation ────────────────────────────
        chat = cached!.chat;
        convId = conversationId!;
        cached!.lastUsed = Date.now();

        // Per-turn config is always sent on turn 2+ so the model knows we
        // still expect TEXT + IMAGE responses.  Include imageConfig when the
        // user specified aspectRatio or resolution for this turn.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perTurnConfig: Record<string, any> = {
          responseModalities: ["TEXT", "IMAGE"],
          tools: [{ googleSearch: {} }],
        };
        if (hasImageConfig) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imgCfg: Record<string, any> = {};
          if (aspectRatio) imgCfg.aspectRatio = aspectRatio;
          if (effectiveResolution) imgCfg.imageSize = effectiveResolution;
          perTurnConfig.imageConfig = imgCfg;
        }

        response = await chat.sendMessage({ message, config: perTurnConfig });
      } else {
        // ── Turn 1: create a fresh chat session ──────────────────────────────
        convId = crypto.randomUUID();
        chat = ai.chats.create({
          model,
          config: {
            responseModalities: ["TEXT", "IMAGE"],
            tools: [{ googleSearch: {} }],
          },
        });
        chatCache.set(convId, { chat, adminId: session.adminId, lastUsed: Date.now() });

        // On turn 1, send the message without per-turn config unless the user
        // explicitly requested imageConfig options (aspectRatio / resolution).
        if (hasImageConfig) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imgCfg: Record<string, any> = {};
          if (aspectRatio) imgCfg.aspectRatio = aspectRatio;
          if (effectiveResolution) imgCfg.imageSize = effectiveResolution;
          response = await chat.sendMessage({
            message,
            config: {
              responseModalities: ["TEXT", "IMAGE"],
              tools: [{ googleSearch: {} }],
              imageConfig: imgCfg,
            },
          });
        } else {
          response = await chat.sendMessage({ message });
        }
      }

      // ── Parse response ───────────────────────────────────────────────────────
      let responseText: string | null        = null;
      let responseImageBase64: string | null = null;
      let responseMimeType: string | null    = null;

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) responseText = (responseText ?? "") + part.text;
        if (part.inlineData?.data) {
          responseImageBase64 = part.inlineData.data;
          responseMimeType    = part.inlineData.mimeType ?? "image/png";
        }
      }

      return new Response(
        JSON.stringify({ text: responseText, imageBase64: responseImageBase64, mimeType: responseMimeType, conversationId: convId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Single-turn: ai.models.generateContent() ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const singleTurnConfig: Record<string, any> = {
      responseModalities: ["TEXT", "IMAGE"],
      tools: [{ googleSearch: {} }],
    };
    if (aspectRatio || effectiveResolution) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imgCfg: Record<string, any> = {};
      if (aspectRatio) imgCfg.aspectRatio = aspectRatio;
      if (effectiveResolution) imgCfg.imageSize = effectiveResolution;
      singleTurnConfig.imageConfig = imgCfg;
    }

    const singleTurnParts = imageParts.length > 0
      ? [...imageParts, { text: prompt }]
      : [{ text: prompt }];

    const result = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: singleTurnParts }],
      config: singleTurnConfig,
    });

    let responseText: string | null        = null;
    let responseImageBase64: string | null = null;
    let responseMimeType: string | null    = null;

    for (const part of result.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) responseText = (responseText ?? "") + part.text;
      if (part.inlineData?.data) {
        responseImageBase64 = part.inlineData.data;
        responseMimeType    = part.inlineData.mimeType ?? "image/png";
      }
    }

    return new Response(
      JSON.stringify({ text: responseText, imageBase64: responseImageBase64, mimeType: responseMimeType }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate] API error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
