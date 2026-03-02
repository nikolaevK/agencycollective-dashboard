import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchAccountInsights, fetchOwnedAccounts } from "@/lib/meta/endpoints";
import {
  transformInsight,
  aggregateInsights,
  transformTimeSeries,
} from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { findUser } from "@/lib/users";

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

    // Time series (daily breakdown)
    const tsCacheKey = CacheKeys.timeSeries(accountId, dateKey);
    let timeSeries = cache.get<ReturnType<typeof transformTimeSeries>>(tsCacheKey);

    if (!timeSeries) {
      const rawInsights = await fetchAccountInsights(accountId, dateRange, 1);
      timeSeries = transformTimeSeries(rawInsights);
      cache.set(tsCacheKey, timeSeries, TTL.INSIGHTS);
    }

    // Aggregate metrics
    const metricsCacheKey = CacheKeys.accountInsights(accountId, dateKey);
    let metrics = cache.get<ReturnType<typeof aggregateInsights>>(metricsCacheKey);

    if (!metrics) {
      const rawInsights = await fetchAccountInsights(accountId, dateRange);
      metrics = aggregateInsights(rawInsights.map(transformInsight));
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
