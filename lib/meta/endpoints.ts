import { metaFetch, metaFetchPost, metaFetchMultipart, metaBatchFetch } from "./client";
import {
  MetaAccountsPaginatedSchema,
  MetaCampaignsPaginatedSchema,
  MetaAdSetsPaginatedSchema,
  MetaAdsPaginatedSchema,
  MetaInsightsPaginatedSchema,
  MetaAdsWithCreativePaginatedSchema,
  MetaCreativeDetailSchema,
  MetaPagesPaginatedSchema,
  MetaAdImageUploadResponseSchema,
  MetaCreateResponseSchema,
  MetaPixelsPaginatedSchema,
  MetaPixelStatsResponseSchema,
  MetaPixelDaChecksResponseSchema,
  MetaActivitiesPaginatedSchema,
} from "./schemas";
import type { MetaAdAccount, MetaCampaign, MetaAdSet, MetaAd, MetaInsight, MetaPaginatedResponse, MetaAdWithCreative, MetaCreativeDetail, MetaPage, MetaPixel, MetaPixelStatEntry, MetaPixelDaCheck, MetaActivity } from "./types";
import { fetchWithConcurrency, getConcurrencyLimit } from "@/lib/concurrency";
import { dateRangeToMetaParams } from "@/lib/utils";
import type { DateRangeInput } from "@/types/api";

const INSIGHT_FIELDS =
  "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,outbound_clicks,website_purchase_roas,frequency";

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
      if (!item || item.code !== 200) {
        console.warn(
          `[batch] Sub-request failed for account ${chunk[j]}: code=${item?.code ?? "null"} body=${item?.body ?? ""}`
        );
        continue;
      }

      let rawBody: unknown;
      try {
        rawBody = JSON.parse(item.body);
      } catch (e) {
        console.warn(`[batch] Failed to parse JSON for account ${chunk[j]}:`, e);
        continue;
      }

      const parsed = MetaInsightsPaginatedSchema.safeParse(rawBody);
      if (!parsed.success) {
        console.warn(
          `[batch] Zod parse failed for account ${chunk[j]}:`,
          parsed.error.flatten()
        );
        continue;
      }
      if (parsed.data.data.length > 0) {
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
  const fields = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,account_id,smart_promotion_type";

  const insightFields = INSIGHT_FIELDS;
  const metaParams = dateRange ? dateRangeToMetaParams(dateRange) : { date_preset: "last_7d" };

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
  const fields = "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,billing_event,optimization_goal,is_adset_budget_sharing_enabled,start_time,end_time";
  const insightFields = INSIGHT_FIELDS;
  const metaParams = dateRange ? dateRangeToMetaParams(dateRange) : { date_preset: "last_7d" };

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
  const metaParams = dateRange ? dateRangeToMetaParams(dateRange) : { date_preset: "last_7d" };

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

/**
 * Fetch all ads for a specific campaign with creative details.
 *
 * Uses the account-level /ads endpoint with a campaign.id filter
 * to avoid the N+1 query of fetching ad sets first.
 * Then fetches creative details (including existing ad copy text) for each ad.
 */
export async function fetchCampaignAdsWithCreatives(
  accountId: string,
  campaignId: string,
  dateRange: DateRangeInput
): Promise<MetaAdWithCreative[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const metaParams = dateRangeToMetaParams(dateRange);

  const dateParam = metaParams.date_preset
    ? `date_preset(${metaParams.date_preset})`
    : `time_range(${metaParams.time_range})`;

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

  const filtering = JSON.stringify([
    { field: "campaign.id", operator: "EQUAL", value: campaignId },
  ]);

  const params: Record<string, string | number | boolean | undefined> = {
    fields: adFields,
    filtering,
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

  // Fetch creative details for each ad (full-res image + ad copy text + page_id)
  const creativeFields =
    "id,image_url,image_hash,thumbnail_url,object_story_spec{page_id,link_data{picture,image_url,image_hash,message,name,description},video_data{image_url}}";

  const concurrency = getConcurrencyLimit();
  await fetchWithConcurrency(
    allAds.map((ad, idx) => ({ ad, idx })),
    async ({ ad, idx }) => {
      const creativeId = (ad.creative as { id?: string } | undefined)?.id;
      if (!creativeId) return;
      try {
        const raw = await metaFetch(
          `/${creativeId}`,
          MetaCreativeDetailSchema,
          { params: { fields: creativeFields } }
        );
        allAds[idx] = { ...ad, creative: raw };
      } catch {
        // Creative fetch failed — leave ad with initial data
      }
    },
    concurrency
  );

  return allAds;
}

/**
 * Fetch Facebook Pages available for an ad account.
 * Tries /promote_pages first (works for most ad accounts),
 * falls back to /me/accounts (pages the token user manages).
 */
export async function fetchAccountPages(accountId: string): Promise<MetaPage[]> {
  const cleanId = accountId.replace(/^act_/, "");

  // Try promote_pages — lists pages eligible for ads under this account
  try {
    const page = await metaFetch(
      `/act_${cleanId}/promote_pages`,
      MetaPagesPaginatedSchema,
      { params: { fields: "id,name", limit: 100 }, retries: 1 }
    );
    if (page.data.length > 0) return page.data as MetaPage[];
  } catch {
    // Fall through to fallback
  }

  // Fallback: pages the token user manages
  const page = await metaFetch(
    `/me/accounts`,
    MetaPagesPaginatedSchema,
    { params: { fields: "id,name", limit: 100 } }
  );

  return page.data as MetaPage[];
}

/**
 * Upload an image to an ad account. Returns the image hash.
 *
 * Two modes:
 * - `source.url` — Meta downloads the image itself (form-encoded POST)
 * - `source.base64` + `source.filename` — we upload the file (multipart POST)
 */
export async function uploadAdImage(
  accountId: string,
  source: { url: string } | { base64: string; filename: string }
): Promise<string> {
  const cleanId = accountId.replace(/^act_/, "");
  const path = `/act_${cleanId}/adimages`;

  if ("url" in source) {
    // Let Meta fetch the image from the URL
    const result = await metaFetchPost(
      path,
      MetaAdImageUploadResponseSchema,
      { url: source.url }
    );
    const firstEntry = Object.values(result.images)[0];
    if (!firstEntry?.hash) throw new Error("No image hash returned from upload");
    return firstEntry.hash;
  }

  // Upload file as multipart/form-data
  const buffer = Buffer.from(source.base64, "base64");
  const blob = new Blob([buffer]);
  const formData = new FormData();
  formData.append("filename", blob, source.filename);

  const result = await metaFetchMultipart(
    path,
    MetaAdImageUploadResponseSchema,
    formData
  );
  const firstEntry = Object.values(result.images)[0];
  if (!firstEntry?.hash) throw new Error("No image hash returned from upload");
  return firstEntry.hash;
}

/**
 * Create an ad creative with an unpublished page post.
 */
export async function createAdCreative(
  accountId: string,
  params: {
    name: string;
    pageId: string;
    imageHash: string;
    message: string;
    headline: string;
    description: string;
    link?: string;
  }
): Promise<string> {
  const cleanId = accountId.replace(/^act_/, "");

  const objectStorySpec = JSON.stringify({
    page_id: params.pageId,
    link_data: {
      image_hash: params.imageHash,
      message: params.message,
      name: params.headline,
      description: params.description,
      ...(params.link ? { link: params.link } : {}),
    },
  });

  const result = await metaFetchPost(
    `/act_${cleanId}/adcreatives`,
    MetaCreateResponseSchema,
    { name: params.name, object_story_spec: objectStorySpec }
  );

  return result.id;
}

/**
 * Create a PAUSED ad under a given ad set.
 */
export async function createDraftAd(
  accountId: string,
  params: { name: string; adsetId: string; creativeId: string }
): Promise<string> {
  const cleanId = accountId.replace(/^act_/, "");

  const result = await metaFetchPost(
    `/act_${cleanId}/ads`,
    MetaCreateResponseSchema,
    {
      name: params.name,
      adset_id: params.adsetId,
      creative: JSON.stringify({ creative_id: params.creativeId }),
      status: "PAUSED",
    }
  );

  return result.id;
}

/**
 * Fetch pixels associated with an ad account.
 */
export async function fetchAccountPixels(accountId: string): Promise<MetaPixel[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const fields = "id,name,creation_time,last_fired_time,is_unavailable,data_use_setting";

  const page = await metaFetch(
    `/act_${cleanId}/adspixels`,
    MetaPixelsPaginatedSchema,
    { params: { fields, limit: 50 } }
  );
  return page.data as MetaPixel[];
}

/**
 * Fetch event stats for a pixel (aggregated by event type).
 */
export async function fetchPixelStats(
  pixelId: string,
  since?: string,
  until?: string
): Promise<MetaPixelStatEntry[]> {
  const params: Record<string, string | number> = { aggregation: "event" };
  if (since) params.start_time = since;
  if (until) params.end_time = until;

  const response = await metaFetch(
    `/${pixelId}/stats`,
    MetaPixelStatsResponseSchema,
    { params }
  );
  // Response is time-bucketed; aggregate event counts across all buckets
  const totals = new Map<string, number>();
  for (const bucket of response.data) {
    if (bucket.data) {
      for (const entry of bucket.data) {
        totals.set(entry.value, (totals.get(entry.value) ?? 0) + (entry.count ?? 0));
      }
    }
  }
  return Array.from(totals, ([event, count]) => ({ event, count }));
}

/**
 * Fetch data availability checks for a pixel.
 * May require business_management permission; fails gracefully.
 */
export async function fetchPixelDaChecks(pixelId: string): Promise<MetaPixelDaCheck[]> {
  try {
    const response = await metaFetch(
      `/${pixelId}/da_checks`,
      MetaPixelDaChecksResponseSchema,
      { retries: 1 }
    );
    return response.data as MetaPixelDaCheck[];
  } catch {
    return [];
  }
}

/**
 * Fetch recent activities for an ad account.
 */
export async function fetchAccountActivities(
  accountId: string,
  limit = 25
): Promise<MetaActivity[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const fields = "event_type,event_time,object_name,translated_event_type,extra_data,actor_name";

  const response = await metaFetch(
    `/act_${cleanId}/activities`,
    MetaActivitiesPaginatedSchema,
    { params: { fields, limit } }
  );
  return response.data as MetaActivity[];
}
