import type { MetaInsight, MetaAdAccount, MetaCampaign, MetaAdSet, MetaAd } from "./types";
import type {
  InsightMetrics,
  AccountSummary,
  CampaignRow,
  AdSetRow,
  AdRow,
  TimeSeriesDataPoint,
  AccountStatus,
  CampaignStatus,
  AdSetStatus,
  AdStatus,
} from "@/types/dashboard";
import { percentChange } from "@/lib/utils";

// Use only the pixel purchase event to avoid double-counting with omni_purchase / purchase
const PURCHASE_ACTION_TYPES = ["offsite_conversion.fb_pixel_purchase"];
// Use specific lead events to avoid double-counting with aggregate "lead" type
const LEAD_ACTION_TYPES = ["offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];

/**
 * Parse a raw Meta insight into domain InsightMetrics
 */
export function transformInsight(raw: MetaInsight): InsightMetrics {
  const spend = typeof raw.spend === "number" ? raw.spend : parseFloat(raw.spend as unknown as string) || 0;
  const impressions = typeof raw.impressions === "number" ? raw.impressions : parseFloat(raw.impressions as unknown as string) || 0;
  const reach = typeof raw.reach === "number" ? raw.reach : parseFloat(raw.reach as unknown as string) || 0;
  const clicks = typeof raw.clicks === "number" ? raw.clicks : parseFloat(raw.clicks as unknown as string) || 0;
  const ctr = typeof raw.ctr === "number" ? raw.ctr : parseFloat(raw.ctr as unknown as string) || 0;
  const cpc = typeof raw.cpc === "number" ? raw.cpc : parseFloat(raw.cpc as unknown as string) || 0;
  const cpm = typeof raw.cpm === "number" ? raw.cpm : parseFloat(raw.cpm as unknown as string) || 0;

  // Extract conversions from actions
  const conversions =
    raw.actions
      ?.filter((a) => PURCHASE_ACTION_TYPES.includes(a.action_type))
      .reduce((sum, a) => sum + (typeof a.value === "number" ? a.value : parseFloat(a.value as unknown as string) || 0), 0) ?? 0;

  // Extract conversion value (purchase revenue) from action_values
  const conversionValue =
    raw.action_values
      ?.filter((a) => PURCHASE_ACTION_TYPES.includes(a.action_type))
      .reduce((sum, a) => sum + (typeof a.value === "number" ? a.value : parseFloat(a.value as unknown as string) || 0), 0) ?? 0;

  // Use Meta's pre-calculated website_purchase_roas if present (most accurate).
  // It's returned as [{action_type, value}] where value is already the ratio.
  // Fall back to conversionValue / spend if not available.
  const metaRoasRaw = raw.website_purchase_roas?.[0]?.value;
  const metaRoas = metaRoasRaw != null
    ? (typeof metaRoasRaw === "number" ? metaRoasRaw : parseFloat(metaRoasRaw as unknown as string) || 0)
    : null;
  const roas = metaRoas ?? (spend > 0 ? conversionValue / spend : 0);

  const costPerPurchase = conversions > 0 ? spend / conversions : 0;

  const frequency = typeof raw.frequency === "number" ? raw.frequency : parseFloat(raw.frequency as unknown as string) || 0;

  const instagramProfileVisits =
    raw.actions
      ?.filter((a) => a.action_type === "instagram_profile_visits")
      .reduce((sum, a) => sum + (typeof a.value === "number" ? a.value : parseFloat(a.value as unknown as string) || 0), 0) ?? 0;

  const leads =
    raw.actions
      ?.filter((a) => LEAD_ACTION_TYPES.includes(a.action_type))
      .reduce((sum, a) => sum + (typeof a.value === "number" ? a.value : parseFloat(a.value as unknown as string) || 0), 0) ?? 0;

  const leadValue =
    raw.action_values
      ?.filter((a) => LEAD_ACTION_TYPES.includes(a.action_type))
      .reduce((sum, a) => sum + (typeof a.value === "number" ? a.value : parseFloat(a.value as unknown as string) || 0), 0) ?? 0;

  return {
    spend,
    impressions,
    reach,
    clicks,
    ctr,
    cpc,
    cpm,
    roas,
    conversions,
    conversionValue,
    costPerPurchase,
    frequency,
    instagramProfileVisits,
    leads,
    leadValue,
  };
}

/**
 * Aggregate multiple insights (e.g., across accounts)
 */
export function aggregateInsights(metrics: InsightMetrics[]): InsightMetrics {
  if (metrics.length === 0) {
    return {
      spend: 0, impressions: 0, reach: 0, clicks: 0,
      ctr: 0, cpc: 0, cpm: 0, roas: 0,
      conversions: 0, conversionValue: 0, costPerPurchase: 0,
      frequency: 0, instagramProfileVisits: 0, leads: 0, leadValue: 0,
    };
  }

  const totalSpend = metrics.reduce((s, m) => s + m.spend, 0);
  const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
  const totalReach = metrics.reduce((s, m) => s + m.reach, 0);
  const totalClicks = metrics.reduce((s, m) => s + m.clicks, 0);
  const totalConversions = metrics.reduce((s, m) => s + m.conversions, 0);
  const totalConversionValue = metrics.reduce((s, m) => s + m.conversionValue, 0);
  const totalInstagramProfileVisits = metrics.reduce((s, m) => s + m.instagramProfileVisits, 0);
  const totalLeads = metrics.reduce((s, m) => s + m.leads, 0);
  const totalLeadValue = metrics.reduce((s, m) => s + m.leadValue, 0);
  // Frequency is per-person, so weighted average by impressions
  const weightedFrequency = totalImpressions > 0
    ? metrics.reduce((s, m) => s + m.frequency * m.impressions, 0) / totalImpressions
    : 0;

  return {
    spend: totalSpend,
    impressions: totalImpressions,
    reach: totalReach,
    clicks: totalClicks,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
    conversions: totalConversions,
    conversionValue: totalConversionValue,
    costPerPurchase: totalConversions > 0 ? totalSpend / totalConversions : 0,
    frequency: weightedFrequency,
    instagramProfileVisits: totalInstagramProfileVisits,
    leads: totalLeads,
    leadValue: totalLeadValue,
  };
}

/**
 * Compute InsightDelta between current and previous period
 */
export function computeDelta(
  current: InsightMetrics,
  previous: InsightMetrics
) {
  return {
    spend: percentChange(current.spend, previous.spend),
    impressions: percentChange(current.impressions, previous.impressions),
    reach: percentChange(current.reach, previous.reach),
    ctr: percentChange(current.ctr, previous.ctr),
    cpc: percentChange(current.cpc, previous.cpc),
    cpm: percentChange(current.cpm, previous.cpm),
    roas: percentChange(current.roas, previous.roas),
    conversions: percentChange(current.conversions, previous.conversions),
    conversionValue: percentChange(current.conversionValue, previous.conversionValue),
    costPerPurchase: percentChange(current.costPerPurchase, previous.costPerPurchase),
    frequency: percentChange(current.frequency, previous.frequency),
  };
}

/**
 * Map Meta account_status numeric code to domain status
 */
function mapAccountStatus(code: number): AccountStatus {
  const statusMap: Record<number, AccountStatus> = {
    1: "ACTIVE",
    2: "DISABLED",
    3: "UNSETTLED",
    7: "PENDING_RISK_REVIEW",
    9: "IN_GRACE_PERIOD",
    100: "DISABLED",
    101: "DISABLED",
  };
  return statusMap[code] ?? "ACTIVE";
}

export function transformAccount(
  account: MetaAdAccount,
  currentInsight: InsightMetrics,
  previousInsight?: InsightMetrics
): AccountSummary {
  const delta = previousInsight
    ? computeDelta(currentInsight, previousInsight)
    : { spend: null, impressions: null, reach: null, ctr: null, cpc: null, cpm: null, roas: null, conversions: null, conversionValue: null, costPerPurchase: null, frequency: null };

  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    timezone: account.timezone_name,
    status: mapAccountStatus(account.account_status),
    insights: currentInsight,
    delta,
  };
}

export function transformCampaign(raw: MetaCampaign): CampaignRow {
  const insight = raw.insights?.data?.[0]
    ? transformInsight(raw.insights.data[0])
    : emptyInsights();

  let budgetType: CampaignRow["budgetType"] = "none";
  let budget = 0;

  if (raw.daily_budget && (raw.daily_budget as unknown as number) > 0) {
    budgetType = "daily";
    budget = (typeof raw.daily_budget === "number" ? raw.daily_budget : parseFloat(raw.daily_budget as unknown as string)) / 100;
  } else if (raw.lifetime_budget && (raw.lifetime_budget as unknown as number) > 0) {
    budgetType = "lifetime";
    budget = (typeof raw.lifetime_budget === "number" ? raw.lifetime_budget : parseFloat(raw.lifetime_budget as unknown as string)) / 100;
  }

  return {
    id: raw.id,
    accountId: raw.account_id,
    name: raw.name,
    status: raw.effective_status as CampaignStatus,
    objective: raw.objective,
    budgetType,
    budget,
    startTime: raw.start_time,
    stopTime: raw.stop_time,
    advantagePlus: raw.smart_promotion_type === "SMART_AUTOMATED",
    insights: insight,
  };
}

export function transformAdSet(raw: MetaAdSet): AdSetRow {
  const insight = raw.insights?.data?.[0]
    ? transformInsight(raw.insights.data[0])
    : emptyInsights();

  let budgetType: AdSetRow["budgetType"] = "none";
  let budget = 0;

  if (raw.daily_budget && (raw.daily_budget as unknown as number) > 0) {
    budgetType = "daily";
    budget = (typeof raw.daily_budget === "number" ? raw.daily_budget : parseFloat(raw.daily_budget as unknown as string)) / 100;
  } else if (raw.lifetime_budget && (raw.lifetime_budget as unknown as number) > 0) {
    budgetType = "lifetime";
    budget = (typeof raw.lifetime_budget === "number" ? raw.lifetime_budget : parseFloat(raw.lifetime_budget as unknown as string)) / 100;
  }

  return {
    id: raw.id,
    campaignId: raw.campaign_id,
    name: raw.name,
    status: raw.effective_status as AdSetStatus,
    budgetType,
    budget,
    billingEvent: raw.billing_event,
    optimizationGoal: raw.optimization_goal,
    budgetSharing: raw.is_adset_budget_sharing_enabled ?? false,
    insights: insight,
  };
}

export function transformAd(raw: MetaAd): AdRow {
  const insight = raw.insights?.data?.[0]
    ? transformInsight(raw.insights.data[0])
    : emptyInsights();

  return {
    id: raw.id,
    adSetId: raw.adset_id,
    name: raw.name,
    status: raw.effective_status as AdStatus,
    previewUrl: raw.preview_shareable_link,
    creativeId: raw.creative?.id,
    insights: insight,
  };
}

/**
 * Transform an array of daily insights to TimeSeriesDataPoint[]
 */
export function transformTimeSeries(
  rawInsights: MetaInsight[]
): TimeSeriesDataPoint[] {
  return rawInsights
    .filter((r) => r.date_start)
    .map((r) => {
      const m = transformInsight(r);
      return {
        date: r.date_start!,
        spend: m.spend,
        impressions: m.impressions,
        reach: m.reach,
        clicks: m.clicks,
        ctr: m.ctr,
        cpc: m.cpc,
        cpm: m.cpm,
        roas: m.roas,
        conversions: m.conversions,
        conversionValue: m.conversionValue,
        costPerPurchase: m.costPerPurchase,
        frequency: m.frequency,
        instagramProfileVisits: m.instagramProfileVisits,
        leads: m.leads,
        leadValue: m.leadValue,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function emptyInsights(): InsightMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, roas: 0,
    conversions: 0, conversionValue: 0, costPerPurchase: 0,
    frequency: 0, instagramProfileVisits: 0, leads: 0, leadValue: 0,
  };
}
