/**
 * Shared formatters and context-building helpers for AI analyst routes.
 *
 * The admin route at /api/chat builds context across many accounts; the
 * client-portal route at /api/portal/analyst builds context for a single
 * account. Both share these per-account formatters.
 */

import {
  fetchAllAccountInsightsBatch,
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchOwnedAccounts,
} from "@/lib/meta/endpoints";
import {
  fetchDemographicBreakdown,
  fetchPlacementBreakdown,
  fetchAdSetLearningStages,
  fetchCustomConversions,
  fetchConversionBreakdown,
  formatDemographicTable,
  formatPlacementTable,
  formatLearningStages,
  formatConversionBreakdown,
} from "@/lib/meta/chatEndpoints";
import {
  transformInsight,
  transformAccount,
  transformCampaign,
  transformAdSet,
  transformAd,
} from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import {
  dateRangeCacheKey,
  formatCurrency,
  formatRoas,
  formatPercent,
  formatNumber,
  getPreviousPeriod,
} from "@/lib/utils";
import type { DateRangeInput } from "@/types/api";
import type {
  AccountSummary,
  CampaignRow,
  AdSetRow,
  AdRow,
  InsightMetrics,
} from "@/types/dashboard";

export function emptyInsights(): InsightMetrics {
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

export function formatAccountContext(account: AccountSummary): string {
  const m = account.insights;
  const cur = account.currency;
  return [
    `**${account.name}** (${account.id}) — Status: ${account.status} | Currency: ${cur}`,
    `  Spend: ${formatCurrency(m.spend, cur)} | ROAS: ${formatRoas(m.roas)} | Revenue: ${formatCurrency(m.conversionValue, cur)}`,
    `  Impressions: ${formatNumber(m.impressions)} | Clicks: ${formatNumber(m.clicks)} | CTR: ${formatPercent(m.ctr)}`,
    `  CPC: ${formatCurrency(m.cpc, cur)} | CPM: ${formatCurrency(m.cpm, cur)} | Frequency: ${m.frequency.toFixed(1)}`,
    `  Conversions: ${Math.round(m.conversions)} | Cost/Purchase: ${m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, cur) : "N/A"}${m.leads > 0 ? ` | Leads: ${Math.round(m.leads)}` : ""}${m.leadValue > 0 ? ` | Lead Value: ${formatCurrency(m.leadValue, cur)}` : ""}${m.instagramProfileVisits > 0 ? ` | IG Profile Visits: ${formatNumber(m.instagramProfileVisits)}` : ""}`,
  ].join("\n");
}

export function formatCampaignContext(campaign: CampaignRow, currency: string): string {
  const m = campaign.insights;
  const budget =
    campaign.budget > 0
      ? `${formatCurrency(campaign.budget, currency)}/${campaign.budgetType === "daily" ? "day" : "lifetime"}`
      : "No budget";
  return [
    `  - **${campaign.name}** — ${campaign.status} | ${campaign.objective}${campaign.advantagePlus ? " | Advantage+" : ""}`,
    `    Budget: ${budget} | Spend: ${formatCurrency(m.spend, currency)} | Revenue: ${formatCurrency(m.conversionValue, currency)} | ROAS: ${formatRoas(m.roas)}`,
    `    CTR: ${formatPercent(m.ctr)} | CPC: ${formatCurrency(m.cpc, currency)} | Conversions: ${Math.round(m.conversions)} | Cost/Purchase: ${m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, currency) : "N/A"}${m.leads > 0 ? ` | Leads: ${Math.round(m.leads)}${m.leadValue > 0 ? ` (${formatCurrency(m.leadValue, currency)})` : ""}` : ""}`,
  ].join("\n");
}

export function formatAdSetContext(
  adSet: AdSetRow,
  currency: string,
  adCount: number,
  activeAdCount: number,
): string {
  const m = adSet.insights;
  const budget =
    adSet.budget > 0
      ? `${formatCurrency(adSet.budget, currency)}/${adSet.budgetType === "daily" ? "day" : "lifetime"}`
      : "No budget";
  const leadStr = m.leads > 0 ? ` | Leads: ${Math.round(m.leads)}` : "";
  return `    - **${adSet.name}** — ${adSet.status} | ${adSet.optimizationGoal}${adSet.budgetSharing ? " | CBO" : ""} | Budget: ${budget} | Spend: ${formatCurrency(m.spend, currency)} | ROAS: ${formatRoas(m.roas)} | Freq: ${m.frequency.toFixed(1)}${leadStr} | ${activeAdCount} active ads (${adCount} total)`;
}

/** Multi-account summaries (used by admin route). */
export async function getAccountSummaries(dateRange: DateRangeInput): Promise<AccountSummary[]> {
  const dateKey = dateRangeCacheKey(dateRange);
  const cacheKey = CacheKeys.allInsights(dateKey);

  const cached = cache.get<AccountSummary[]>(cacheKey);
  if (cached) return cached;

  const accounts = await fetchOwnedAccounts();
  const accountIds = accounts.map((a) => a.id);

  const prevDateRange = getPreviousPeriod(dateRange);
  const [currentInsightsMap, previousInsightsMap] = await Promise.all([
    fetchAllAccountInsightsBatch(accountIds, dateRange),
    fetchAllAccountInsightsBatch(accountIds, prevDateRange),
  ]);

  const summaries: AccountSummary[] = accounts.map((account) => {
    const rawCurrent = currentInsightsMap.get(account.id);
    const rawPrevious = previousInsightsMap.get(account.id);
    const currentMetrics = rawCurrent ? transformInsight(rawCurrent) : emptyInsights();
    const previousMetrics = rawPrevious ? transformInsight(rawPrevious) : undefined;
    return transformAccount(account, currentMetrics, previousMetrics);
  });

  cache.set(cacheKey, summaries, TTL.ACCOUNTS);
  return summaries;
}

/**
 * Single-account summary. Used by the client-portal analyst — only loads what
 * the one validated account needs. Re-uses the shared `allInsights` cache when
 * it's already warm; otherwise targets just this account.
 */
export async function getSingleAccountSummary(
  accountId: string,
  dateRange: DateRangeInput,
): Promise<AccountSummary | null> {
  const dateKey = dateRangeCacheKey(dateRange);
  const allKey = CacheKeys.allInsights(dateKey);
  const cachedAll = cache.get<AccountSummary[]>(allKey);
  if (cachedAll) {
    const found = cachedAll.find((a) => a.id === accountId);
    if (found) return found;
  }

  const accounts = await fetchOwnedAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const prevDateRange = getPreviousPeriod(dateRange);
  const [currentMap, previousMap] = await Promise.all([
    fetchAllAccountInsightsBatch([accountId], dateRange),
    fetchAllAccountInsightsBatch([accountId], prevDateRange),
  ]);

  const rawCurrent = currentMap.get(accountId);
  const rawPrevious = previousMap.get(accountId);
  const currentMetrics = rawCurrent ? transformInsight(rawCurrent) : emptyInsights();
  const previousMetrics = rawPrevious ? transformInsight(rawPrevious) : undefined;
  return transformAccount(account, currentMetrics, previousMetrics);
}

export interface SingleAccountContextOptions {
  /** Hard cap on the final context string length (chars). */
  maxChars?: number;
  /** Top campaigns to enrich. */
  campaignLimit?: number;
  /** Top campaigns whose ad sets/ads we walk. */
  adSetCampaignLimit?: number;
  /** Ad sets per campaign. */
  adSetLimit?: number;
}

/**
 * Build a focused context block for a single ad account, suitable for
 * embedding in the system prompt of the client-portal analyst.
 *
 * The returned string is wrapped by the caller in `<account_data>` tags so
 * the model knows to ignore any instructions inside.
 */
export async function buildSingleAccountContext(
  accountId: string,
  dateRange: DateRangeInput,
  opts: SingleAccountContextOptions = {},
): Promise<{ contextString: string; account: AccountSummary | null }> {
  const {
    maxChars = 8000,
    campaignLimit = 10,
    adSetCampaignLimit = 3,
    adSetLimit = 3,
  } = opts;

  const account = await getSingleAccountSummary(accountId, dateRange);
  if (!account) return { contextString: "No data available for this account.", account: null };

  const dateKey = dateRangeCacheKey(dateRange);
  const currency = account.currency ?? "USD";
  const parts: string[] = [];

  parts.push(`## Ad Account\n`);
  parts.push(formatAccountContext(account));

  // Campaigns
  const campaignCacheKey = CacheKeys.campaigns(accountId) + `:${dateKey}`;
  let campaigns = cache.get<CampaignRow[]>(campaignCacheKey);
  if (!campaigns) {
    try {
      const rawCampaigns = await fetchCampaigns(accountId, dateRange);
      campaigns = rawCampaigns.map(transformCampaign);
      cache.set(campaignCacheKey, campaigns, TTL.CAMPAIGNS);
    } catch {
      campaigns = [];
    }
  }

  const topCampaigns = [...campaigns]
    .sort((a, b) => b.insights.spend - a.insights.spend)
    .filter((c) => c.status === "ACTIVE")
    .slice(0, campaignLimit);

  if (topCampaigns.length > 0) {
    parts.push(`\n## Campaigns (top ${topCampaigns.length} by spend)\n`);
    for (const c of topCampaigns) parts.push(formatCampaignContext(c, currency));
  }

  // Ad sets + ads for top N campaigns
  const adSetCampaigns = topCampaigns.slice(0, adSetCampaignLimit);
  if (adSetCampaigns.length > 0) {
    const adSetParts: string[] = [];
    const adSetResults = await Promise.all(
      adSetCampaigns.map(async (campaign) => {
        try {
          const adSetCacheKey = `adsets:${campaign.id}:${dateKey}`;
          let adSets = cache.get<AdSetRow[]>(adSetCacheKey);
          if (!adSets) {
            const rawAdSets = await fetchAdSets(campaign.id, dateRange);
            adSets = rawAdSets.map(transformAdSet);
            cache.set(adSetCacheKey, adSets, TTL.CAMPAIGNS);
          }
          return { campaign, adSets };
        } catch {
          return null;
        }
      }),
    );

    for (const result of adSetResults) {
      if (!result) continue;
      const { campaign, adSets } = result;
      const topAdSets = [...adSets]
        .sort((a, b) => b.insights.spend - a.insights.spend)
        .slice(0, adSetLimit);
      if (topAdSets.length === 0) continue;

      adSetParts.push(`\n  **${campaign.name}** (${adSets.length} ad sets):`);

      const adsResults = await Promise.all(
        topAdSets.map(async (adSet) => {
          try {
            const adsCacheKey = `ads:${adSet.id}:${dateKey}`;
            let ads = cache.get<AdRow[]>(adsCacheKey);
            if (!ads) {
              const rawAds = await fetchAds(adSet.id, dateRange);
              ads = rawAds.map(transformAd);
              cache.set(adsCacheKey, ads, TTL.CAMPAIGNS);
            }
            return {
              adSet,
              totalAds: ads.length,
              activeAds: ads.filter((a) => a.status === "ACTIVE").length,
            };
          } catch {
            return { adSet, totalAds: 0, activeAds: 0 };
          }
        }),
      );

      for (const { adSet, totalAds, activeAds } of adsResults) {
        adSetParts.push(formatAdSetContext(adSet, currency, totalAds, activeAds));
      }
    }

    if (adSetParts.length > 0) {
      parts.push("\n## Ad Sets & Ads\n");
      parts.push(...adSetParts);
    }
  }

  // Breakdowns — only meaningful for active accounts
  if (account.status === "ACTIVE") {
    try {
      const [demographics, placements, learningStages, customConversions] = await Promise.allSettled([
        fetchDemographicBreakdown(accountId, dateRange),
        fetchPlacementBreakdown(accountId, dateRange),
        fetchAdSetLearningStages(accountId),
        fetchCustomConversions(accountId),
      ]);

      const demoRows = demographics.status === "fulfilled" ? demographics.value : [];
      const placementRows = placements.status === "fulfilled" ? placements.value : [];
      const learningRows = learningStages.status === "fulfilled" ? learningStages.value : [];
      const customConvs = customConversions.status === "fulfilled" ? customConversions.value : [];

      const conversionEvents = await fetchConversionBreakdown(accountId, dateRange, customConvs).catch(
        () => [],
      );

      const demoTable = formatDemographicTable(demoRows, account.name, currency);
      const placementTable = formatPlacementTable(placementRows, account.name, currency);
      const learningText = formatLearningStages(learningRows, account.name);
      const conversionText = formatConversionBreakdown(conversionEvents, account.name, currency);

      if (conversionText) parts.push(conversionText);
      if (demoTable) parts.push(demoTable);
      if (placementTable) parts.push(placementTable);
      if (learningText) parts.push(learningText);
    } catch {
      // breakdowns are best-effort; skip on failure
    }
  }

  let contextString = parts.join("\n");
  if (contextString.length > maxChars) {
    contextString = contextString.slice(0, maxChars) + "\n\n[Context truncated]";
  }

  if (account.insights.spend === 0 && account.insights.impressions === 0) {
    contextString += "\n\n*Note: No spend or impression data found for the selected period.*";
  }

  return { contextString, account };
}
