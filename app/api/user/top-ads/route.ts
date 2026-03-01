import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchTopAdsForAccount } from "@/lib/meta/endpoints";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);
    const { accountId } = session;

    const cacheKey = `top_ads:${accountId}:${dateKey}`;
    let topAds = cache.get<Awaited<ReturnType<typeof fetchTopAdsForAccount>>>(cacheKey);

    if (!topAds) {
      topAds = await fetchTopAdsForAccount(accountId, dateRange, 3);
      cache.set(cacheKey, topAds, TTL.ADS);
    }

    return NextResponse.json({ data: topAds });
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
    const message = err instanceof Error ? err.message : String(err);
    console.error("Top ads error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
