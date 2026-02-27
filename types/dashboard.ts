export interface InsightMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;   // percentage
  cpc: number;
  cpm: number;
  roas: number;
  conversions: number;
  conversionValue: number;
  costPerPurchase: number;
}

export interface InsightDelta {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  ctr: number | null;
  cpc: number | null;
  roas: number | null;
  conversions: number | null;
  conversionValue: number | null;
  costPerPurchase: number | null;
}

export interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: AccountStatus;
  insights: InsightMetrics;
  delta: InsightDelta;
}

export type AccountStatus = "ACTIVE" | "PAUSED" | "DISABLED" | "UNSETTLED" | "PENDING_RISK_REVIEW" | "IN_GRACE_PERIOD";

export interface CampaignRow {
  id: string;
  accountId: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  budgetType: "daily" | "lifetime" | "none";
  budget: number;
  startTime?: string;
  stopTime?: string;
  insights: InsightMetrics;
}

export type CampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" | "IN_PROCESS" | "WITH_ISSUES";

export interface AdSetRow {
  id: string;
  campaignId: string;
  name: string;
  status: AdSetStatus;
  budgetType: "daily" | "lifetime" | "none";
  budget: number;
  billingEvent: string;
  optimizationGoal: string;
  insights: InsightMetrics;
}

export type AdSetStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" | "IN_PROCESS" | "WITH_ISSUES";

export interface AdRow {
  id: string;
  adSetId: string;
  name: string;
  status: AdStatus;
  previewUrl?: string;
  creativeId?: string;
  insights: InsightMetrics;
}

export type AdStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" | "IN_PROCESS" | "WITH_ISSUES" | "DISAPPROVED";

export interface TimeSeriesDataPoint {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  conversions: number;
}

export interface InsightRow {
  entityId: string;
  entityName: string;
  entityType: "account" | "campaign" | "adset" | "ad";
  metrics: InsightMetrics;
  timeSeries?: TimeSeriesDataPoint[];
}
