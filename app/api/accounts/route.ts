import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchOwnedAccounts, fetchAllAccountInsightsBatch } from "@/lib/meta/endpoints";
import { transformAccount, transformInsight, aggregateInsights } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, getPreviousPeriod, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { AccountSummary } from "@/types/dashboard";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const cacheKey = CacheKeys.allInsights(dateKey);
    const cached = cache.get<AccountSummary[]>(cacheKey);

    if (cached) {
      const response: ApiResponse<AccountSummary[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
      });
    }

    // Fetch accounts
    const accounts = await fetchOwnedAccounts();
    const accountIds = accounts.map((a) => a.id);

    // Fetch current and previous period insights in parallel via Batch API
    const prevDateRange = getPreviousPeriod(dateRange);
    const [currentInsightsMap, previousInsightsMap] = await Promise.all([
      fetchAllAccountInsightsBatch(accountIds, dateRange),
      fetchAllAccountInsightsBatch(accountIds, prevDateRange),
    ]);

    // Log accounts that returned no insights (likely a batch sub-request failure)
    const missingCurrent = accounts.filter((a) => !currentInsightsMap.has(a.id));
    if (missingCurrent.length > 0) {
      console.warn(
        `[accounts] ${missingCurrent.length} account(s) returned no current insights (showing $0):`,
        missingCurrent.map((a) => `${a.name} (${a.id})`).join(", ")
      );
    }

    // Transform accounts
    const summaries: AccountSummary[] = accounts.map((account) => {
      const rawCurrent = currentInsightsMap.get(account.id);
      const rawPrevious = previousInsightsMap.get(account.id);

      const currentMetrics = rawCurrent ? transformInsight(rawCurrent) : emptyInsights();
      const previousMetrics = rawPrevious ? transformInsight(rawPrevious) : undefined;

      return transformAccount(account, currentMetrics, previousMetrics);
    });

    cache.set(cacheKey, summaries, TTL.ACCOUNTS);

    const response: ApiResponse<AccountSummary[]> = {
      data: summaries,
      meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
    };
    return NextResponse.json(response);
  } catch (err) {
    return handleError(err);
  }
}

function emptyInsights() {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    roas: 0,
    conversions: 0,
    conversionValue: 0,
    costPerPurchase: 0,
    frequency: 0,
    instagramProfileVisits: 0,
    leads: 0,
    leadValue: 0,
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
  console.error("API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
