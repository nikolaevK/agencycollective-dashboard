import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchCampaigns } from "@/lib/meta/endpoints";
import { transformCampaign } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { CampaignRow } from "@/types/dashboard";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId || !/^act_\d+$/.test(accountId)) {
      return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
    }

    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);
    const cacheKey = CacheKeys.campaigns(accountId) + `:${dateKey}`;

    const cached = cache.get<CampaignRow[]>(cacheKey);
    if (cached) {
      const response: ApiResponse<CampaignRow[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
      });
    }

    const rawCampaigns = await fetchCampaigns(accountId, dateRange);
    const campaigns = rawCampaigns.map(transformCampaign);

    cache.set(cacheKey, campaigns, TTL.CAMPAIGNS);

    const response: ApiResponse<CampaignRow[]> = {
      data: campaigns,
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
  console.error("Campaigns API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
