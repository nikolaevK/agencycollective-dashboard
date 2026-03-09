export const dynamic = "force-dynamic";

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { ALLOWED_MODELS, type ChatModelId } from "@/lib/chatModels";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// ─── Industry presets ───────────────────────────────────────────────────────
const ALLOWED_INDUSTRIES = new Set([
  "peptides",
  "supplements",
  "skincare",
  "fitness",
  "wellness",
]);

// ─── Image download helper ──────────────────────────────────────────────────
interface DownloadedImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

async function downloadImage(url: string): Promise<DownloadedImage | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    let mediaType: DownloadedImage["mediaType"] = "image/jpeg";
    if (contentType.includes("png")) mediaType = "image/png";
    else if (contentType.includes("gif")) mediaType = "image/gif";
    else if (contentType.includes("webp")) mediaType = "image/webp";

    const buffer = await res.arrayBuffer();
    // Skip images larger than 5 MB to stay within Claude limits
    if (buffer.byteLength > 5 * 1024 * 1024) return null;

    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mediaType };
  } catch {
    return null;
  }
}

// ─── Input types ────────────────────────────────────────────────────────────
interface CreativeInput {
  adId: string;
  adName: string;
  imageUrl: string | null;
  existingPrimaryText: string | null;
  existingHeadline: string | null;
  existingDescription: string | null;
  spend: number;
  ctr: number;
}

interface UploadedImageInput {
  name: string;
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400 });
}

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!checkRateLimit(session.adminId)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before generating again." }),
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request body");

    const {
      selectedCreatives: rawCreatives,
      uploadedImages: rawUploads,
      campaignName,
      campaignObjective,
      campaignSpend,
      campaignRoas,
      model: modelRaw,
      industry: industryRaw,
      customIndustry: customIndustryRaw,
    } = body as Record<string, unknown>;

    // ── Validate creatives ─────────────────────────────────────────────────
    const creatives = (Array.isArray(rawCreatives) ? rawCreatives : []) as CreativeInput[];

    // ── Validate uploaded images ────────────────────────────────────────────
    const uploads: UploadedImageInput[] = [];
    if (Array.isArray(rawUploads)) {
      for (const u of rawUploads.slice(0, 10)) {
        if (
          u &&
          typeof u === "object" &&
          typeof u.base64 === "string" &&
          typeof u.mediaType === "string" &&
          ALLOWED_MEDIA_TYPES.has(u.mediaType) &&
          u.base64.length <= 7_200_000 // ~5MB in base64
        ) {
          uploads.push(u as UploadedImageInput);
        }
      }
    }

    if (creatives.length === 0 && uploads.length === 0) {
      return badRequest("At least one creative or uploaded image is required");
    }
    if (creatives.length > 10) {
      return badRequest("Maximum 10 creatives allowed");
    }

    // ── Validate campaign info ─────────────────────────────────────────────
    if (typeof campaignName !== "string" || !campaignName) {
      return badRequest("campaignName is required");
    }

    // ── Validate model ─────────────────────────────────────────────────────
    const model: ChatModelId =
      typeof modelRaw === "string" && ALLOWED_MODELS.includes(modelRaw as ChatModelId)
        ? (modelRaw as ChatModelId)
        : "claude-sonnet-4-6";

    // ── Validate industry ──────────────────────────────────────────────────
    let industry = "peptides";
    if (typeof industryRaw === "string" && ALLOWED_INDUSTRIES.has(industryRaw)) {
      industry = industryRaw;
    } else if (industryRaw === "custom" && typeof customIndustryRaw === "string" && customIndustryRaw.trim().length > 0) {
      industry = customIndustryRaw.trim().slice(0, 100);
    }

    const industryLabel = industry.charAt(0).toUpperCase() + industry.slice(1);
    const spend = typeof campaignSpend === "number" ? `$${campaignSpend.toFixed(2)}` : "N/A";
    const roas = typeof campaignRoas === "number" ? campaignRoas.toFixed(2) : "N/A";
    const objective = typeof campaignObjective === "string" ? campaignObjective : "N/A";

    // ── Download images from URLs for vision (Meta thumbnails) ─────────────
    const imageDownloads = await Promise.allSettled(
      creatives.map(async (c) => {
        if (!c.imageUrl) return null;
        return downloadImage(c.imageUrl);
      })
    );

    // ── Build message content blocks with vision ───────────────────────────
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    const totalInputs = creatives.length + uploads.length;
    contentBlocks.push({
      type: "text",
      text: `Here are ${totalInputs} ad creative image${totalInputs !== 1 ? "s" : ""} from the campaign "${campaignName}" (${objective}). Total spend: ${spend}, ROAS: ${roas}.\n\nIMPORTANT: Carefully analyze each creative image. Extract any promo codes, discount percentages, product names, brand names, and specific offers visible on the images. Use these exact details in your generated ad copy.`,
    });

    // Add uploaded images first (these are high-quality user-provided images)
    for (let i = 0; i < uploads.length; i++) {
      const u = uploads[i];
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: u.mediaType,
          data: u.base64,
        },
      });
      contentBlocks.push({
        type: "text",
        text: `\n**Uploaded Creative ${i + 1}: "${u.name}"**\n(High-resolution uploaded image — analyze carefully for promo codes, offers, product details)`,
      });
    }

    // Add Meta creatives with their performance data
    for (let i = 0; i < creatives.length; i++) {
      const c = creatives[i];
      const result = imageDownloads[i];
      const downloaded =
        result.status === "fulfilled" ? result.value : null;

      // Add image if available
      if (downloaded) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: downloaded.mediaType,
            data: downloaded.base64,
          },
        });
      }

      // Add text context for this creative
      const lines = [
        `\n**Creative ${uploads.length + i + 1}: "${c.adName}"**`,
        `Spend: $${c.spend.toFixed(2)} | CTR: ${c.ctr.toFixed(2)}%`,
      ];
      if (c.existingPrimaryText) lines.push(`Current Primary Text: "${c.existingPrimaryText}"`);
      if (c.existingHeadline) lines.push(`Current Headline: "${c.existingHeadline}"`);
      if (c.existingDescription) lines.push(`Current Description: "${c.existingDescription}"`);
      if (!downloaded && c.imageUrl) lines.push(`(Image could not be loaded)`);

      contentBlocks.push({ type: "text", text: lines.join("\n") });
    }

    const systemPrompt = `Act like a seasoned FB ADS media buyer with 15+ years of experience helping businesses run ads in the ${industryLabel} industry, build authority and drive conversions through paid ads.

You are analyzing a campaign and its creative images to generate high-converting ad copy.

CAMPAIGN CONTEXT:
- Campaign: ${campaignName}
- Objective: ${objective}
- Total Spend: ${spend}
- ROAS: ${roas}

YOUR TASK:
Give me 5 best converting direct to response primary text options for my facebook ads as well as 5 short headlines for these creatives.

FORMAT YOUR RESPONSE EXACTLY AS:

## Primary Text Options

### 1. [Short descriptive title]
[Full primary text here — multiple paragraphs are fine, include CTA]

### 2. [Short descriptive title]
[Full primary text here]

### 3. [Short descriptive title]
[Full primary text here]

### 4. [Short descriptive title]
[Full primary text here]

### 5. [Short descriptive title]
[Full primary text here]

## Headlines

1. [headline text — keep under 40 characters]
2. [headline text]
3. [headline text]
4. [headline text]
5. [headline text]

## Descriptions

1. [description text — 1-2 short sentences for the link description area]
2. [description text]
3. [description text]

CRITICAL — IMAGE ANALYSIS:
Before writing any copy, carefully analyze each creative image for:
- Promo codes visible on the image (e.g. "GETPEP15", "SAVE20") — use the EXACT code in your copy
- Discount percentages shown (e.g. "15% OFF", "Save 20%") — reference the exact offer
- Product names, brand names, and taglines visible on the creative
- Key visual messaging, offers, urgency cues, and CTAs shown on the image
- Product type and positioning (e.g. vials, packaging, lifestyle imagery)

You MUST incorporate any promo codes, discount percentages, and specific offers you see in the images directly into the primary text and headlines. Do not make up codes or percentages — only use what is visible in the creatives or provided in the existing ad copy.

GUIDELINES:
- Direct response / conversion-driven language
- Build authority in the ${industryLabel} industry
- Clear calls to action that reference specific offers/codes from the creatives
- Emotional triggers and urgency where appropriate
- Short, punchy headlines that complement the primary text
- Match the tone and style to what the creative images convey
- For primary text, write complete ad copy (3-5 short paragraphs each) — not just taglines
- Include trust signals, social proof angles, and specific benefits
- If a promo code or discount is visible in the creative, every primary text variation should reference it`;

    // Stream response from Claude
    const stream = await anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(new TextEncoder().encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[ad-copy] API error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
}
