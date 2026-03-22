import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchAccountInsights } from "@/lib/meta/endpoints";
import { transformInsight, transformTimeSeries, aggregateInsights } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";

export interface InsightsResponseData {
  metrics: InsightMetrics;
  timeSeries?: TimeSeriesDataPoint[];
}

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const withTimeSeries = searchParams.get("timeSeries") === "true";

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const cacheKey = withTimeSeries
      ? CacheKeys.timeSeries(accountId, dateKey)
      : CacheKeys.accountInsights(accountId, dateKey);

    const cached = cache.get<InsightsResponseData>(cacheKey);
    if (cached) {
      const response: ApiResponse<InsightsResponseData> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
      });
    }

    if (withTimeSeries) {
      // Fetch daily breakdown (for chart) and aggregate (for KPI metrics) in parallel.
      // Do NOT derive KPI metrics by summing daily rows — Reach is a deduplicated count
      // and cannot be summed; Spend can also differ due to late attribution.
      const [rawDaily, rawAggregate] = await Promise.all([
        fetchAccountInsights(accountId, dateRange, 1),
        fetchAccountInsights(accountId, dateRange),
      ]);

      const timeSeries = transformTimeSeries(rawDaily);
      const metrics = rawAggregate[0] ? transformInsight(rawAggregate[0]) : emptyInsights();

      const data: InsightsResponseData = { metrics, timeSeries };
      cache.set(cacheKey, data, TTL.INSIGHTS);

      const response: ApiResponse<InsightsResponseData> = {
        data,
        meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response);
    } else {
      const rawInsights = await fetchAccountInsights(accountId, dateRange);
      const metrics = rawInsights[0] ? transformInsight(rawInsights[0]) : emptyInsights();

      const data: InsightsResponseData = { metrics };
      cache.set(cacheKey, data, TTL.INSIGHTS);

      const response: ApiResponse<InsightsResponseData> = {
        data,
        meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response);
    }
  } catch (err) {
    return handleError(err);
  }
}

function emptyInsights(): InsightMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 0, conversionValue: 0, costPerPurchase: 0,
  };
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
  console.error("Insights API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
