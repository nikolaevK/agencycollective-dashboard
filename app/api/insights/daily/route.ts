export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchAccountInsights, fetchOwnedAccounts } from "@/lib/meta/endpoints";
import { transformTimeSeries } from "@/lib/meta/transformers";
import { mergeTimeSeries } from "@/lib/timeseries";
import { fetchWithConcurrency, getConcurrencyLimit } from "@/lib/concurrency";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { TimeSeriesDataPoint } from "@/types/dashboard";

const MAX_ACCOUNTS = 200;
/** A partial result (some accounts failed) is kept briefly, so reloads don't
 *  re-run the whole fan-out while Meta is struggling. */
const PARTIAL_TTL_SECONDS = 60;

interface DailyInsightsResponseData {
  timeSeries: TimeSeriesDataPoint[];
  /** Accounts merged into the series / accounts whose daily read failed. */
  accounts: number;
  failed: number;
}

/**
 * Agency-wide daily insights: the daily rows of the given ad accounts, merged
 * into one series (Overview trend chart + card sparklines). Each account is
 * read with exactly the call the account page makes for its chart
 * (`fetchAccountInsights(id, range, 1)`), so the rows come from — and fill —
 * the same 24h Meta cache entries. The caller passes only accounts that spent
 * in the range; ids that aren't the token's own ad accounts are dropped.
 */
export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const requested = Array.from(
      new Set(
        (searchParams.get("accountIds") ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ).sort();
    if (requested.length > MAX_ACCOUNTS) {
      return NextResponse.json({ error: `At most ${MAX_ACCOUNTS} accounts` }, { status: 400 });
    }
    if (requested.length === 0) {
      return NextResponse.json({ data: { timeSeries: [], accounts: 0, failed: 0 } });
    }

    // Owned accounts only (cached 24h like every Meta read) — and the L1 key
    // is built from them, so foreign / junk ids can't mint cache entries.
    const owned = new Set((await fetchOwnedAccounts()).map((a) => a.id));
    const accountIds = requested.filter((id) => owned.has(id));
    if (accountIds.length === 0) {
      return NextResponse.json({ data: { timeSeries: [], accounts: 0, failed: 0 } });
    }

    const cacheKey = `daily_insights:${dateKey}:${accountIds.join(",")}`;
    const cached = cache.get<DailyInsightsResponseData>(cacheKey);
    if (cached) {
      const response: ApiResponse<DailyInsightsResponseData> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
      });
    }

    // A rate limit or a dead token fails every remaining call too (Meta's
    // limits are app/user-wide): stop dispatching at the first one.
    const stop: { error: RateLimitError | TokenExpiredError | null } = { error: null };
    const results = await fetchWithConcurrency(
      accountIds,
      async (id) => {
        if (stop.error) throw stop.error;
        try {
          return await fetchAccountInsights(id, dateRange, 1);
        } catch (err) {
          if (err instanceof RateLimitError || err instanceof TokenExpiredError) stop.error ??= err;
          throw err;
        }
      },
      getConcurrencyLimit()
    );
    const series: TimeSeriesDataPoint[][] = [];
    let failed = 0;
    let firstError: unknown = null;
    for (const result of results) {
      if (result.status === "fulfilled") {
        series.push(transformTimeSeries(result.value));
      } else {
        failed++;
        firstError ??= result.reason;
        if (result.reason !== stop.error) {
          console.warn(`[insights/daily] Daily insights failed for ${result.input}:`, result.reason);
        }
      }
    }
    if (stop.error) {
      console.warn(`[insights/daily] Stopped after ${stop.error.name}; ${failed} account(s) skipped or failed`);
    }
    // Nothing came back: surface the cause (rate limit / expired token) rather
    // than an empty chart that reads as "no spend".
    if (series.length === 0 && failed > 0) throw stop.error ?? firstError;

    const data: DailyInsightsResponseData = {
      timeSeries: mergeTimeSeries(series),
      accounts: series.length,
      failed,
    };
    cache.set(cacheKey, data, failed === 0 ? TTL.INSIGHTS : PARTIAL_TTL_SECONDS);

    const response: ApiResponse<DailyInsightsResponseData> = {
      data,
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
    console.error("Daily insights API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
