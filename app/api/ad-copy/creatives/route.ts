export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchCampaignAdsWithCreatives } from "@/lib/meta/endpoints";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { AdCopyCreative } from "@/lib/adCopy/types";
import type { MetaAdWithCreative, MetaCreativeDetail } from "@/lib/meta/types";

/**
 * Resolve the best available image URL from a creative.
 * Uses thumbnail_url as the primary source — Meta's API reliably returns this.
 * Higher-res fields are checked first in case they're available.
 */
function resolveImageUrl(creative: MetaCreativeDetail | undefined): string | null {
  if (!creative) return null;

  // Higher-res options (if available)
  if (creative.image_url) return creative.image_url;
  if (creative.object_story_spec?.link_data?.image_url) {
    return creative.object_story_spec.link_data.image_url;
  }
  if (creative.object_story_spec?.link_data?.picture) {
    return creative.object_story_spec.link_data.picture;
  }

  const videoPic =
    creative.object_story_spec?.video_data?.image_url ??
    creative.video_data?.thumbnail_url;
  if (videoPic) return videoPic;

  // Reliable fallback
  return creative.thumbnail_url ?? null;
}

function transformToCreative(ad: MetaAdWithCreative): AdCopyCreative {
  const c = ad.creative;
  const insights = ad.insights?.data?.[0] as Record<string, number | undefined> | undefined;
  const link = (c?.object_story_spec?.link_data as { link?: unknown } | undefined)?.link;

  return {
    adId: ad.id,
    adName: ad.name,
    creativeId: c?.id ?? "",
    adsetId: ad.adset_id ?? null,
    pageId: c?.object_story_spec?.page_id ?? null,
    imageHash: c?.image_hash ?? c?.object_story_spec?.link_data?.image_hash ?? null,
    imageUrl: resolveImageUrl(c),
    thumbnailUrl: c?.thumbnail_url ?? null,
    existingPrimaryText: c?.object_story_spec?.link_data?.message ?? null,
    existingHeadline: c?.object_story_spec?.link_data?.name ?? null,
    existingDescription: c?.object_story_spec?.link_data?.description ?? null,
    spend: (insights?.spend ?? 0) as number,
    impressions: (insights?.impressions ?? 0) as number,
    clicks: (insights?.clicks ?? 0) as number,
    ctr: (insights?.ctr ?? 0) as number,
    existingLink: typeof link === "string" && /^https?:\/\//i.test(link) ? link : null,
    isVideo: Boolean(c?.object_story_spec?.video_data || c?.video_data),
  };
}

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const campaignId = searchParams.get("campaignId");

    if (!accountId || !/^act_\d+$/.test(accountId)) {
      return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
    }
    if (!campaignId || !/^\d+$/.test(campaignId)) {
      return NextResponse.json({ error: "Invalid campaignId" }, { status: 400 });
    }

    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);
    // Account in the L1 key too: the Meta read is filtered by BOTH, so a
    // mismatched pair must not cache an empty list for the real account.
    const cacheKey = CacheKeys.campaignCreatives(`${accountId}:${campaignId}`, dateKey);

    const cached = cache.get<AdCopyCreative[]>(cacheKey);
    if (cached) {
      const response: ApiResponse<AdCopyCreative[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response);
    }

    const rawAds = await fetchCampaignAdsWithCreatives(accountId, campaignId, dateRange);
    const creatives = rawAds.map(transformToCreative);

    cache.set(cacheKey, creatives, TTL.CREATIVES);

    const response: ApiResponse<AdCopyCreative[]> = {
      data: creatives,
      meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
    };
    return NextResponse.json(response);
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
    console.error("[ad-copy/creatives] API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
