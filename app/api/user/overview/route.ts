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
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
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
    ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 0, conversionValue: 0, costPerPurchase: 0, frequency: 0, instagramProfileVisits: 0, leads: 0, leadValue: 0,
  };
}

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Re-validate user
    const userRecord = await findUser(session.userId);
    if (!userRecord) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    // Allow client-side account selection via query param, with ownership validation
    const requestedAccountId = searchParams.get("accountId");
    let accountId = session.accountId || userRecord.accountId;

    // Fetch linked accounts for ownership validation and label lookup
    const userAccounts = await readActiveAccountsForUser(session.userId);

    if (requestedAccountId && requestedAccountId !== accountId) {
      if (userAccounts.some((a) => a.accountId === requestedAccountId)) {
        accountId = requestedAccountId;
      }
    }

    // Get admin-assigned label for this account
    const linkedAccount = userAccounts.find((a) => a.accountId === accountId);

    // Time series + aggregate metrics — fetch in parallel when both caches are cold
    const tsCacheKey = portalTimeSeriesCacheKey(accountId, dateKey);
    const metricsCacheKey = portalMetricsCacheKey(accountId, dateKey);
    let timeSeries = cache.get<TimeSeriesDataPoint[]>(tsCacheKey);
    let metrics = cache.get<InsightMetrics>(metricsCacheKey);

    const needTs = !timeSeries;
    const needMetrics = !metrics;

    if (needTs || needMetrics) {
      const [tsRaw, metricsRaw] = await Promise.all([
        needTs ? fetchAccountInsights(accountId, dateRange, 1) : Promise.resolve(null),
        needMetrics ? fetchAccountInsights(accountId, dateRange) : Promise.resolve(null),
      ]);
      if (tsRaw) {
        timeSeries = transformTimeSeries(tsRaw);
        cache.set(tsCacheKey, timeSeries, TTL.INSIGHTS);
      }
      if (metricsRaw) {
        metrics = metricsRaw[0] ? transformInsight(metricsRaw[0]) : emptyInsights();
        cache.set(metricsCacheKey, metrics, TTL.INSIGHTS);
      }
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
        accountName: linkedAccount?.label || account?.name || accountId,
        displayName: userRecord.displayName,
        currency: account?.currency ?? "USD",
        logoPath,
        metrics,
        timeSeries,
      },
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
