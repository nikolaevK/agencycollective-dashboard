export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { fetchAccountInsights } from "@/lib/meta/endpoints";
import { transformTimeSeries } from "@/lib/meta/transformers";
import { mergeTimeSeries } from "@/lib/timeseries";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { TimeSeriesDataPoint } from "@/types/dashboard";

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userRecord = await findUser(session.userId);
    if (!userRecord) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const linkedAccounts = await readActiveAccountsForUser(session.userId);
    if (linkedAccounts.length === 0) {
      return NextResponse.json({ data: { timeSeries: [] } });
    }

    const cacheK = `portal:combined-ts:${session.userId}:${dateKey}`;
    const cached = cache.get<TimeSeriesDataPoint[]>(cacheK);
    if (cached) {
      return NextResponse.json(
        { data: { timeSeries: cached } },
        { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" } }
      );
    }

    const accountIds = linkedAccounts.map((a) => a.accountId);

    // Fetch daily time series for each account in parallel (N calls only — no separate metrics fetch)
    const tsResults = await Promise.all(
      accountIds.map((id) => fetchAccountInsights(id, dateRange, 1))
    );

    const perAccountTs = tsResults.map((raw) => transformTimeSeries(raw));
    const timeSeries = mergeTimeSeries(perAccountTs);

    cache.set(cacheK, timeSeries, TTL.INSIGHTS);

    return NextResponse.json(
      { data: { timeSeries } },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" } }
    );
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
    console.error("Combined overview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
