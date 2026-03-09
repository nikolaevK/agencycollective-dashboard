export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { uploadAdImage, createAdCreative, createDraftAd } from "@/lib/meta/endpoints";
import { RateLimitError, TokenExpiredError, MetaApiError } from "@/lib/meta/client";

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request body");

    const {
      accountId,
      adsetId,
      pageId,
      adName,
      primaryText,
      headline,
      description,
      websiteUrl,
      imageBase64,
      imageHash: existingImageHash,
      imageUrl,
    } = body as Record<string, string | undefined>;

    // Validate required fields
    if (!accountId || !/^act_\d+$/.test(accountId)) return badRequest("Invalid accountId");
    if (!adsetId) return badRequest("adsetId is required");
    if (!pageId) return badRequest("pageId is required");
    if (!adName) return badRequest("adName is required");
    if (!primaryText) return badRequest("primaryText is required");
    if (!headline) return badRequest("headline is required");
    if (!description) return badRequest("description is required");

    // Step 1: Resolve image hash
    console.log("[publish-draft] Image inputs:", { existingImageHash, hasBase64: !!imageBase64, hasUrl: !!imageUrl });
    let imageHash: string;
    if (existingImageHash) {
      // Reuse existing hash from Meta creative — no upload needed
      console.log("[publish-draft] Step 1: reusing existing imageHash:", existingImageHash);
      imageHash = existingImageHash;
    } else if (imageBase64) {
      // Uploaded image — send as multipart file
      console.log("[publish-draft] Step 1: uploading base64 image...");
      imageHash = await uploadAdImage(accountId, {
        base64: imageBase64,
        filename: `${adName.replace(/[^a-zA-Z0-9]/g, "_")}.jpg`,
      });
    } else if (imageUrl) {
      // Creative image URL — let Meta download it directly
      console.log("[publish-draft] Step 1: uploading via URL...");
      imageHash = await uploadAdImage(accountId, { url: imageUrl });
    } else {
      return badRequest("Image is required (imageHash, imageBase64, or imageUrl)");
    }
    console.log("[publish-draft] Step 1 done, imageHash:", imageHash);

    // Step 2: Create ad creative
    console.log("[publish-draft] Step 2: creating creative...", { pageId, imageHash });
    const creativeId = await createAdCreative(accountId, {
      name: `${adName} Creative`,
      pageId,
      imageHash,
      message: primaryText,
      headline,
      description,
      link: websiteUrl || undefined,
    });
    console.log("[publish-draft] Step 2 done, creativeId:", creativeId);

    // Step 3: Create paused ad
    console.log("[publish-draft] Step 3: creating ad...", { adsetId, creativeId });
    const adId = await createDraftAd(accountId, {
      name: adName,
      adsetId,
      creativeId,
    });
    console.log("[publish-draft] Step 3 done, adId:", adId);

    return NextResponse.json({ success: true, adId, creativeId });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, retryAfter: err.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
      );
    }
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof MetaApiError) {
      console.error("[ad-copy/publish-draft] Meta API error:", {
        message: err.message,
        code: err.metaCode,
        subcode: err.metaSubcode,
      });
      return NextResponse.json(
        { error: err.message, metaCode: err.metaCode, metaSubcode: err.metaSubcode },
        { status: 400 }
      );
    }
    console.error("[ad-copy/publish-draft] API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
