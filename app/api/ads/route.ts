export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchAds } from "@/lib/meta/endpoints";
import { transformAd } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { AdRow } from "@/types/dashboard";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const adSetId = searchParams.get("adSetId");

    if (!adSetId) {
      return NextResponse.json({ error: "adSetId is required" }, { status: 400 });
    }

    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);
    const cacheKey = CacheKeys.ads(adSetId) + `:${dateKey}`;

    const cached = cache.get<AdRow[]>(cacheKey);
    if (cached) {
      const response: ApiResponse<AdRow[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response);
    }

    const rawAds = await fetchAds(adSetId, dateRange);
    const ads = rawAds.map(transformAd);

    cache.set(cacheKey, ads, TTL.ADS);

    const response: ApiResponse<AdRow[]> = {
      data: ads,
      meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
    };
    return NextResponse.json(response);
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: err.message, retryAfter: err.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
    );
  }
  if (err instanceof TokenExpiredError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error("Ads API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
