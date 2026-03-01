import { z } from "zod";
import { metaFetch, metaBatchFetch } from "./client";
import {
  MetaAccountsPaginatedSchema,
  MetaCampaignsPaginatedSchema,
  MetaAdSetsPaginatedSchema,
  MetaAdsPaginatedSchema,
  MetaInsightsPaginatedSchema,
  MetaAdsWithCreativePaginatedSchema,
  MetaCreativeDetailSchema,
} from "./schemas";
import type { MetaAdAccount, MetaCampaign, MetaAdSet, MetaAd, MetaInsight, MetaPaginatedResponse, MetaAdWithCreative, MetaCreativeDetail } from "./types";
import { fetchWithConcurrency, getConcurrencyLimit } from "@/lib/concurrency";
import { dateRangeToMetaParams } from "@/lib/utils";
import type { DateRangeInput } from "@/types/api";

const INSIGHT_FIELDS =
  "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,outbound_clicks,website_purchase_roas";

const INSIGHT_FIELDS_WITH_DATE = INSIGHT_FIELDS + ",date_start,date_stop";

/**
 * Fetch all ad accounts accessible by the current user token (/me/adaccounts).
 * Requires ads_read permission. No Business Manager ID needed.
 */
export async function fetchOwnedAccounts(): Promise<MetaAdAccount[]> {
  const fields = "id,name,currency,timezone_name,account_status";

  let allAccounts: MetaAdAccount[] = [];
  let afterCursor: string | undefined;

  do {
    const params: Record<string, string | number | boolean | undefined> = {
      fields,
      limit: 200,
      after: afterCursor,
    };

    const page = await metaFetch(
      `/me/adaccounts`,
      MetaAccountsPaginatedSchema,
      { params }
    );

    allAccounts = allAccounts.concat(page.data as MetaAdAccount[]);
    afterCursor = page.paging?.cursors?.after;

    if (!page.paging?.next) break;
  } while (afterCursor);

  return allAccounts;
}

/**
 * Fetch insights for a single account, following pagination so all days are returned.
 */
export async function fetchAccountInsights(
  accountId: string,
  dateRange: DateRangeInput,
  timeIncrement?: number
): Promise<MetaInsight[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const metaParams = dateRangeToMetaParams(dateRange);

  const params: Record<string, string | number | boolean | undefined> = {
    fields: INSIGHT_FIELDS_WITH_DATE,
    level: "account",
    limit: 100, // fetch up to 100 rows per page
    ...metaParams,
  };

  if (timeIncrement) {
    params.time_increment = timeIncrement;
  }

  let allInsights: MetaInsight[] = [];
  let afterCursor: string | undefined;

  do {
    const pageParams = { ...params, after: afterCursor };
    const page = await metaFetch(
      `/act_${cleanId}/insights`,
      MetaInsightsPaginatedSchema,
      { params: pageParams }
    );

    allInsights = allInsights.concat(page.data as MetaInsight[]);
    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  return allInsights;
}

/**
 * Fetch insights for multiple accounts with concurrency limiting
 */
export async function fetchAllAccountInsights(
  accountIds: string[],
  dateRange: DateRangeInput
): Promise<Map<string, MetaInsight>> {
  const concurrency = getConcurrencyLimit();
  const results = await fetchWithConcurrency(
    accountIds,
    async (accountId) => {
      const insights = await fetchAccountInsights(accountId, dateRange);
      return { accountId, insight: insights[0] || null };
    },
    concurrency
  );

  const map = new Map<string, MetaInsight>();
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.insight) {
      map.set(result.value.accountId, result.value.insight);
    }
  }
  return map;
}

/**
 * Fetch insights for multiple accounts using Meta Batch API.
 * Sends up to 50 requests per batch POST, far more efficient than N individual GETs.
 */
export async function fetchAllAccountInsightsBatch(
  accountIds: string[],
  dateRange: DateRangeInput,
  timeIncrement?: number
): Promise<Map<string, MetaInsight>> {
  const metaParams = dateRangeToMetaParams(dateRange);
  const BATCH_SIZE = 50;
  const map = new Map<string, MetaInsight>();

  // Build query string for each account insight request
  function buildRelativeUrl(accountId: string): string {
    const cleanId = accountId.replace(/^act_/, "");
    const qs = new URLSearchParams();
    qs.set("fields", INSIGHT_FIELDS);
    qs.set("level", "account");
    if (metaParams.date_preset) {
      qs.set("date_preset", metaParams.date_preset);
    } else if (metaParams.time_range) {
      qs.set("time_range", metaParams.time_range as string);
    }
    if (timeIncrement) {
      qs.set("time_increment", String(timeIncrement));
    }
    return `act_${cleanId}/insights?${qs.toString()}`;
  }

  // Process in chunks of BATCH_SIZE
  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const chunk = accountIds.slice(i, i + BATCH_SIZE);
    const batchRequests = chunk.map((id) => ({
      method: "GET" as const,
      relative_url: buildRelativeUrl(id),
    }));

    const batchResults = await metaBatchFetch(batchRequests);

    for (let j = 0; j < chunk.length; j++) {
      const item = batchResults[j];
      if (!item || item.code !== 200) continue;

      const parsed = MetaInsightsPaginatedSchema.safeParse(
        JSON.parse(item.body)
      );
      if (parsed.success && parsed.data.data.length > 0) {
        map.set(chunk[j], parsed.data.data[0] as unknown as MetaInsight);
      }
    }
  }

  return map;
}

/**
 * Fetch campaigns for an account (with nested insights)
 */
export async function fetchCampaigns(
  accountId: string,
  dateRange?: DateRangeInput
): Promise<MetaCampaign[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const fields = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,account_id";

  const insightFields = INSIGHT_FIELDS;
  const metaParams = dateRange ? dateRangeToMetaParams(dateRange) : { date_preset: "last_30d" };

  // Build insight fields param for nested request — Meta requires parentheses syntax
  const dateParam = metaParams.date_preset
    ? `date_preset(${metaParams.date_preset})`
    : `time_range(${metaParams.time_range})`;

  const fieldsWithInsights = `${fields},insights.${dateParam}{${insightFields}}`;

  let allCampaigns: MetaCampaign[] = [];
  let afterCursor: string | undefined;

  do {
    const params: Record<string, string | number | boolean | undefined> = {
      fields: fieldsWithInsights,
      limit: 100,
      after: afterCursor,
    };

    const page = await metaFetch(
      `/act_${cleanId}/campaigns`,
      MetaCampaignsPaginatedSchema,
      { params }
    );

    allCampaigns = allCampaigns.concat(page.data as MetaCampaign[]);
    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  return allCampaigns;
}

/**
 * Fetch insights for a specific campaign
 */
export async function fetchCampaignInsights(
  campaignId: string,
  dateRange: DateRangeInput,
  timeIncrement?: number
): Promise<MetaInsight[]> {
  const metaParams = dateRangeToMetaParams(dateRange);

  const params: Record<string, string | number | boolean | undefined> = {
    fields: INSIGHT_FIELDS_WITH_DATE,
    level: "campaign",
    ...metaParams,
  };

  if (timeIncrement) params.time_increment = timeIncrement;

  const response = await metaFetch(
    `/${campaignId}/insights`,
    MetaInsightsPaginatedSchema,
    { params }
  );

  return response.data as MetaInsight[];
}

/**
 * Fetch ad sets for a campaign (with nested insights)
 */
export async function fetchAdSets(
  campaignId: string,
  dateRange?: DateRangeInput
): Promise<MetaAdSet[]> {
  const fields = "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,billing_event,optimization_goal,start_time,end_time";
  const insightFields = INSIGHT_FIELDS;
  const metaParams = dateRange ? dateRangeToMetaParams(dateRange) : { date_preset: "last_30d" };

  const dateParam = metaParams.date_preset
    ? `date_preset(${metaParams.date_preset})`
    : `time_range(${metaParams.time_range})`;

  const fieldsWithInsights = `${fields},insights.${dateParam}{${insightFields}}`;

  let allAdSets: MetaAdSet[] = [];
  let afterCursor: string | undefined;

  do {
    const params: Record<string, string | number | boolean | undefined> = {
      fields: fieldsWithInsights,
      limit: 100,
      after: afterCursor,
    };

    const page = await metaFetch(
      `/${campaignId}/adsets`,
      MetaAdSetsPaginatedSchema,
      { params }
    );

    allAdSets = allAdSets.concat(page.data as MetaAdSet[]);
    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  return allAdSets;
}

/**
 * Fetch ads for an ad set (with nested insights)
 */
export async function fetchAds(
  adSetId: string,
  dateRange?: DateRangeInput
): Promise<MetaAd[]> {
  const fields = "id,name,status,effective_status,adset_id,campaign_id,creative,preview_shareable_link";
  const insightFields = INSIGHT_FIELDS;
  const metaParams = dateRange ? dateRangeToMetaParams(dateRange) : { date_preset: "last_30d" };

  const dateParam = metaParams.date_preset
    ? `date_preset(${metaParams.date_preset})`
    : `time_range(${metaParams.time_range})`;

  const fieldsWithInsights = `${fields},insights.${dateParam}{${insightFields}}`;

  let allAds: MetaAd[] = [];
  let afterCursor: string | undefined;

  do {
    const params: Record<string, string | number | boolean | undefined> = {
      fields: fieldsWithInsights,
      limit: 100,
      after: afterCursor,
    };

    const page = await metaFetch(
      `/${adSetId}/ads`,
      MetaAdsPaginatedSchema,
      { params }
    );

    allAds = allAds.concat(page.data as MetaAd[]);
    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  return allAds;
}

/**
 * Fetch top N ads for an account by spend, including creative images.
 *
 * Step 1: Fetch all ads with nested spend insights (simple fields).
 * Step 2: Sort by spend, take top N.
 * Step 3: Fetch creative thumbnail for each top ad individually.
 */
export async function fetchTopAdsForAccount(
  accountId: string,
  dateRange: DateRangeInput,
  limit = 3
): Promise<MetaAdWithCreative[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const metaParams = dateRangeToMetaParams(dateRange);

  const dateParam = metaParams.date_preset
    ? `date_preset(${metaParams.date_preset})`
    : `time_range(${metaParams.time_range})`;

  // Step 1: Fetch ads with spend + key metrics insights (no creative expansion here)
  const adFields = [
    "id",
    "name",
    "status",
    "effective_status",
    "adset_id",
    "campaign_id",
    "campaign{name}",
    "creative",
    `insights.${dateParam}{spend,impressions,clicks,ctr,cpc}`,
  ].join(",");

  const params: Record<string, string | number | boolean | undefined> = {
    fields: adFields,
    limit: 200,
  };

  let allAds: MetaAdWithCreative[] = [];
  let afterCursor: string | undefined;

  do {
    const pageParams = { ...params, after: afterCursor };
    const page = await metaFetch(
      `/act_${cleanId}/ads`,
      MetaAdsWithCreativePaginatedSchema,
      { params: pageParams }
    );

    allAds = allAds.concat(page.data as MetaAdWithCreative[]);
    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  // Step 2: Sort by spend and take top N
  allAds.sort((a, b) => {
    const spendA = (a.insights?.data?.[0]?.spend as number | undefined) ?? 0;
    const spendB = (b.insights?.data?.[0]?.spend as number | undefined) ?? 0;
    return spendB - spendA;
  });

  const topAds = allAds.slice(0, limit);

  // Step 3: Fetch creative details for top ads individually.
  // image_hash lets us resolve the full-res URL via /adimages in step 4.
  const creativeFields =
    "id,image_url,thumbnail_url,image_hash,object_story_spec{link_data{picture,image_url,image_hash},photo_data{images},video_data{image_url}}";

  await Promise.allSettled(
    topAds.map(async (ad, idx) => {
      const creativeId = (ad.creative as { id?: string } | undefined)?.id;
      if (!creativeId) return;
      try {
        const raw = await metaFetch(
          `/${creativeId}`,
          MetaCreativeDetailSchema,
          { params: { fields: creativeFields } }
        );
        topAds[idx] = { ...ad, creative: raw };
      } catch {
        // Creative fetch failed — leave ad without thumbnail
      }
    })
  );

  return topAds;
}
