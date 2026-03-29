export const dynamic = "force-dynamic";

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { getAdminSession } from "@/lib/adminSession";
import {
  getAnalysisPrompt,
  ALLOWED_USE_CASES,
  type UseCase,
  type ImageRole,
} from "@/lib/jsonEditorPrompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// ─── Input constraints ─────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Claude's 5 MB limit is on base64 size; base64 expands ~33%, so raw limit ≈ 3.75 MB
const CLAUDE_MAX_RAW_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_ROLES: readonly ImageRole[] = ["source", "reference"];

/** Compress image to fit within Claude's base64 5 MB limit. */
async function compressForClaude(
  buffer: Buffer,
): Promise<{ data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" }> {
  // If already under the limit, return as-is (convert to JPEG for consistency)
  if (buffer.length <= CLAUDE_MAX_RAW_BYTES) {
    // Detect actual format via sharp to avoid trusting client-reported MIME
    const meta = await sharp(buffer).metadata();
    const format = meta.format;
    if (format === "png" || format === "webp") {
      const mt = format === "png" ? "image/png" : "image/webp";
      return { data: buffer, mediaType: mt as "image/png" | "image/webp" };
    }
    return { data: buffer, mediaType: "image/jpeg" };
  }

  // Compress as JPEG with decreasing quality until under limit
  let quality = 85;
  let result = await sharp(buffer).jpeg({ quality }).toBuffer();

  while (result.length > CLAUDE_MAX_RAW_BYTES && quality > 30) {
    quality -= 10;
    result = await sharp(buffer).jpeg({ quality }).toBuffer();
  }

  // If still too large, resize down progressively
  if (result.length > CLAUDE_MAX_RAW_BYTES) {
    const meta = await sharp(buffer).metadata();
    let width = meta.width ?? 1920;
    while (result.length > CLAUDE_MAX_RAW_BYTES && width > 400) {
      width = Math.round(width * 0.7);
      result = await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
    }
  }

  if (result.length > CLAUDE_MAX_RAW_BYTES) {
    throw new Error("Image could not be compressed below the 5 MB API limit");
  }

  return { data: result, mediaType: "image/jpeg" };
}

// ─── JSON extraction helper ────────────────────────────────────────────────
function extractJsonFromResponse(text: string): string {
  // Try parsing raw text first
  try {
    JSON.parse(text);
    return text;
  } catch {
    // continue
  }

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      JSON.parse(fenceMatch[1].trim());
      return fenceMatch[1].trim();
    } catch {
      // continue
    }
  }

  // Extract first { ... } block
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const candidate = text.slice(braceStart, braceEnd + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // continue
    }
  }

  throw new Error("Failed to extract valid JSON from analysis response");
}

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Image analysis is not configured" }),
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();

    // ── Image ──────────────────────────────────────────────────────────────
    const imageFile = formData.get("image");
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      return new Response(JSON.stringify({ error: "Image is required" }), { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      return new Response(JSON.stringify({ error: "Unsupported image type" }), { status: 400 });
    }
    if (imageFile.size > MAX_UPLOAD_BYTES) {
      return new Response(JSON.stringify({ error: "Image exceeds 20 MB upload limit" }), { status: 400 });
    }

    // ── Use case ───────────────────────────────────────────────────────────
    const useCaseRaw = formData.get("useCase");
    if (typeof useCaseRaw !== "string" || !ALLOWED_USE_CASES.includes(useCaseRaw as UseCase)) {
      return new Response(JSON.stringify({ error: "Invalid use case" }), { status: 400 });
    }
    const useCase = useCaseRaw as UseCase;

    // ── Image role ─────────────────────────────────────────────────────────
    const imageRoleRaw = formData.get("imageRole");
    const imageRole: ImageRole =
      typeof imageRoleRaw === "string" && ALLOWED_ROLES.includes(imageRoleRaw as ImageRole)
        ? (imageRoleRaw as ImageRole)
        : "source";

    // ── Compress image to fit Claude's base64 5 MB limit ───────────────────
    const rawBytes = Buffer.from(await imageFile.arrayBuffer());
    const { data: imageBuffer, mediaType } = await compressForClaude(rawBytes);
    const base64 = imageBuffer.toString("base64");

    // ── Call Claude ────────────────────────────────────────────────────────
    const systemPrompt = getAnalysisPrompt(useCase, imageRole);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Analyze this image and return the structured JSON as specified.",
            },
          ],
        },
      ],
    });

    // ── Extract JSON from response ─────────────────────────────────────────
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "text") responseText += block.text;
    }
    if (!responseText) {
      return new Response(
        JSON.stringify({ error: "No text in analysis response" }),
        { status: 500 },
      );
    }

    const jsonString = extractJsonFromResponse(responseText);
    const formatted = JSON.stringify(JSON.parse(jsonString), null, 2);

    return new Response(JSON.stringify({ json: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[json-editor/analyze] API error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
