export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchOwnedAccounts, fetchAllAccountInsightsBatch, fetchCampaigns } from "@/lib/meta/endpoints";
import { transformInsight, transformCampaign } from "@/lib/meta/transformers";
import { evaluateAlerts, DEFAULT_ALERT_CONFIG } from "@/lib/alerts";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, getPreviousPeriod, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import type { ApiResponse } from "@/types/api";
import type { Alert } from "@/types/alerts";
import type { AlertEvaluationInput } from "@/types/alerts";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const cacheKey = CacheKeys.alerts(dateKey);
    const cached = cache.get<Alert[]>(cacheKey);

    if (cached) {
      const response: ApiResponse<Alert[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response);
    }

    const prevDateRange = getPreviousPeriod(dateRange);

    // Fetch accounts — only evaluate active ones, exclude specific accounts
    const EXCLUDED_ACCOUNT_NAMES = ["foreignpipes", "grounding"];
    const allAccounts = await fetchOwnedAccounts();
    const accounts = allAccounts.filter(
      (a) => a.account_status === 1 &&
        !EXCLUDED_ACCOUNT_NAMES.some((ex) => a.name.toLowerCase().includes(ex))
    );
    const accountIds = accounts.map((a) => a.id);

    // Fetch current and previous period insights for all accounts via Batch API
    const [currentInsightsMap, previousInsightsMap] = await Promise.all([
      fetchAllAccountInsightsBatch(accountIds, dateRange),
      fetchAllAccountInsightsBatch(accountIds, prevDateRange),
    ]);

    // Fetch campaigns for all accounts (limited to active ones)
    const campaignsByAccount = await Promise.allSettled(
      accounts.map((account) =>
        fetchCampaigns(account.id, dateRange).then((campaigns) => ({
          accountId: account.id,
          campaigns,
        }))
      )
    );

    const prevCampaignsByAccount = await Promise.allSettled(
      accounts.map((account) =>
        fetchCampaigns(account.id, prevDateRange).then((campaigns) => ({
          accountId: account.id,
          campaigns,
        }))
      )
    );

    // Build campaign previous insights map
    const prevCampaignInsights = new Map<string, ReturnType<typeof transformInsight>>();
    for (const result of prevCampaignsByAccount) {
      if (result.status === "fulfilled") {
        for (const campaign of result.value.campaigns) {
          if (campaign.insights?.data?.[0]) {
            prevCampaignInsights.set(
              campaign.id,
              transformInsight(campaign.insights.data[0])
            );
          }
        }
      }
    }

    // Build evaluation input
    const evaluationInput: AlertEvaluationInput = {
      accounts: accounts.map((account, i) => {
        const rawCurrent = currentInsightsMap.get(account.id);
        const rawPrevious = previousInsightsMap.get(account.id);

        const currentInsights = rawCurrent ? transformInsight(rawCurrent) : emptyInsights();
        const previousInsights = rawPrevious ? transformInsight(rawPrevious) : emptyInsights();

        const campaignsResult = campaignsByAccount[i];
        const rawCampaigns =
          campaignsResult.status === "fulfilled"
            ? campaignsResult.value.campaigns
            : [];

        return {
          id: account.id,
          name: account.name,
          currentInsights,
          previousInsights,
          campaigns: rawCampaigns
            .filter((c) => c.effective_status === "ACTIVE")
            .map((campaign) => {
              const transformed = transformCampaign(campaign);
              const prevInsight = prevCampaignInsights.get(campaign.id) ?? emptyInsights();
              return {
                id: transformed.id,
                name: transformed.name,
                budget: transformed.budget,
                budgetType: transformed.budgetType,
                currentInsights: transformed.insights,
                previousInsights: prevInsight,
              };
            }),
        };
      }),
      evaluatedAt: new Date().toISOString(),
    };

    const alerts = evaluateAlerts(evaluationInput, DEFAULT_ALERT_CONFIG);

    cache.set(cacheKey, alerts, TTL.ALERTS);

    const response: ApiResponse<Alert[]> = {
      data: alerts,
      meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
    };
    return NextResponse.json(response);
  } catch (err) {
    return handleError(err);
  }
}

function emptyInsights() {
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
  console.error("Alerts API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
