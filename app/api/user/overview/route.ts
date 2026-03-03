export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchAccountInsights, fetchOwnedAccounts } from "@/lib/meta/endpoints";
import {
  transformInsight,
  transformTimeSeries,
} from "@/lib/meta/transformers";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { findUser } from "@/lib/users";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";

// Use portal-specific cache keys to avoid colliding with admin insight caches,
// which store a different shape ({ metrics, timeSeries } vs raw arrays/metrics).
function portalMetricsCacheKey(accountId: string, dateKey: string) {
  return `portal:metrics:${accountId}:${dateKey}`;
}
function portalTimeSeriesCacheKey(accountId: string, dateKey: string) {
  return `portal:timeseries:${accountId}:${dateKey}`;
}

function emptyInsights(): InsightMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 0, conversionValue: 0, costPerPurchase: 0,
  };
}

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Re-validate user and get accountId from DB (not just from session token)
    const userRecord = await findUser(session.userId);
    if (!userRecord) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);
    const accountId = userRecord.accountId;

    // Time series (daily breakdown) — portal-namespaced cache key avoids colliding
    // with admin's /api/insights route which stores { metrics, timeSeries } at the same key.
    const tsCacheKey = portalTimeSeriesCacheKey(accountId, dateKey);
    let timeSeries = cache.get<TimeSeriesDataPoint[]>(tsCacheKey);

    if (!timeSeries) {
      const rawInsights = await fetchAccountInsights(accountId, dateRange, 1);
      timeSeries = transformTimeSeries(rawInsights);
      cache.set(tsCacheKey, timeSeries, TTL.INSIGHTS);
    }

    // Aggregate metrics — use transformInsight directly (same as admin's /api/insights)
    // so Meta's pre-calculated website_purchase_roas is used for ROAS.
    const metricsCacheKey = portalMetricsCacheKey(accountId, dateKey);
    let metrics = cache.get<InsightMetrics>(metricsCacheKey);

    if (!metrics) {
      const rawInsights = await fetchAccountInsights(accountId, dateRange);
      metrics = rawInsights[0] ? transformInsight(rawInsights[0]) : emptyInsights();
      cache.set(metricsCacheKey, metrics, TTL.INSIGHTS);
    }

    // Account name + currency (cached separately)
    const accountsCacheKey = "accounts:list";
    let accounts = cache.get<Array<{ id: string; name: string; currency: string }>>(accountsCacheKey);
    if (!accounts) {
      const raw = await fetchOwnedAccounts();
      accounts = raw.map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
      cache.set(accountsCacheKey, accounts, TTL.ACCOUNTS);
    }

    const account = accounts.find((a) => a.id === accountId);

    const logoPath = userRecord.logoPath ?? null;

    return NextResponse.json({
      data: {
        accountId,
        accountName: account?.name ?? accountId,
        currency: account?.currency ?? "USD",
        logoPath,
        metrics,
        timeSeries,
      },
    });
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
    console.error("User overview error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
