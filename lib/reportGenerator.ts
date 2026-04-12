/**
 * Server-side report generation for the generate_report tool.
 * Fetches Meta API data and builds a structured report.
 */

import { fetchOwnedAccounts, fetchAllAccountInsightsBatch, fetchCampaigns } from "@/lib/meta/endpoints";
import {
  fetchDemographicBreakdown,
  fetchPlacementBreakdown,
  fetchConversionBreakdown,
  fetchCustomConversions,
} from "@/lib/meta/chatEndpoints";
import { transformInsight, transformAccount, transformCampaign } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { dateRangeCacheKey, formatCurrency, formatRoas, formatPercent, formatNumber, getPreviousPeriod } from "@/lib/utils";
import { validateExternalUrl, sanitizeUrlForDisplay } from "@/lib/urlValidation";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary, CampaignRow } from "@/types/dashboard";
import type {
  ReportSection,
  ReportResult,
  ReportSectionResult,
  MetricItem,
  DisplayChartInput,
  DisplayTableInput,
} from "@/types/chat";

// ─── Date range parsing ──────────────────────────────────────────────────────

const PRESET_MAP: Record<string, DateRangeInput> = {
  "last 7 days":  { preset: "last_7d" },
  "last 14 days": { preset: "last_14d" },
  "last 30 days": { preset: "last_30d" },
  "last 90 days": { preset: "last_90d" },
  "this month":   { preset: "this_month" },
  "last month":   { preset: "last_month" },
};

function parsePeriodToDateRange(period: string): DateRangeInput {
  const normalized = period.toLowerCase().trim();
  if (PRESET_MAP[normalized]) return PRESET_MAP[normalized];
  // Try extracting date range from "YYYY-MM-DD to YYYY-MM-DD"
  const match = period.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (match) return { since: match[1], until: match[2] };
  return { preset: "last_7d" };
}

// ─── Data fetching helpers ───────────────────────────────────────────────────

async function getAccountSummary(
  accountId: string,
  dateRange: DateRangeInput
): Promise<AccountSummary | null> {
  const dateKey = dateRangeCacheKey(dateRange);
  const cacheKey = CacheKeys.allInsights(dateKey);

  const cached = cache.get<AccountSummary[]>(cacheKey);
  if (cached) {
    const found = cached.find((a) => a.id === accountId);
    if (found) return found;
  }

  const accounts = await fetchOwnedAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const prevDateRange = getPreviousPeriod(dateRange);
  const [currentMap, prevMap] = await Promise.all([
    fetchAllAccountInsightsBatch([accountId], dateRange),
    fetchAllAccountInsightsBatch([accountId], prevDateRange),
  ]);

  const rawCurrent = currentMap.get(accountId);
  const rawPrev = prevMap.get(accountId);
  const current = rawCurrent ? transformInsight(rawCurrent) : emptyInsights();
  const prev = rawPrev ? transformInsight(rawPrev) : undefined;

  return transformAccount(account, current, prev);
}

async function getCampaigns(
  accountId: string,
  dateRange: DateRangeInput
): Promise<CampaignRow[]> {
  const dateKey = dateRangeCacheKey(dateRange);
  const cacheKey = CacheKeys.campaigns(accountId) + `:${dateKey}`;

  const cached = cache.get<CampaignRow[]>(cacheKey);
  if (cached) return cached;

  const raw = await fetchCampaigns(accountId, dateRange);
  const campaigns = raw.map(transformCampaign);
  cache.set(cacheKey, campaigns, TTL.CAMPAIGNS);
  return campaigns;
}

function emptyInsights() {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, roas: 0,
    conversions: 0, conversionValue: 0, costPerPurchase: 0,
  };
}

// ─── Section builders ────────────────────────────────────────────────────────

function buildOverviewSection(
  account: AccountSummary,
  currency: string
): ReportSectionResult {
  const m = account.insights;
  const d = account.delta;

  const metrics: MetricItem[] = [
    {
      label: "Total Spend",
      value: formatCurrency(m.spend, currency),
      trend: d.spend != null ? (d.spend > 0 ? "up" : d.spend < 0 ? "down" : "neutral") : undefined,
      subtitle: d.spend != null ? `${d.spend > 0 ? "+" : ""}${d.spend.toFixed(1)}% vs prev period` : undefined,
    },
    {
      label: "ROAS",
      value: formatRoas(m.roas),
      trend: d.roas != null ? (d.roas > 0 ? "up" : d.roas < 0 ? "down" : "neutral") : undefined,
      subtitle: d.roas != null ? `${d.roas > 0 ? "+" : ""}${d.roas.toFixed(1)}% vs prev period` : undefined,
      color: m.roas >= 3 ? "green" : m.roas >= 2 ? "blue" : "red",
    },
    {
      label: "Purchases",
      value: formatNumber(Math.round(m.conversions)),
      trend: d.conversions != null ? (d.conversions > 0 ? "up" : d.conversions < 0 ? "down" : "neutral") : undefined,
    },
    {
      label: "Revenue",
      value: formatCurrency(m.conversionValue, currency),
      trend: d.conversionValue != null ? (d.conversionValue > 0 ? "up" : d.conversionValue < 0 ? "down" : "neutral") : undefined,
      color: "green",
    },
    {
      label: "CTR",
      value: formatPercent(m.ctr),
      trend: d.ctr != null ? (d.ctr > 0 ? "up" : d.ctr < 0 ? "down" : "neutral") : undefined,
    },
    {
      label: "Cost per Purchase",
      value: m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, currency) : "N/A",
      trend: d.costPerPurchase != null ? (d.costPerPurchase > 0 ? "down" : d.costPerPurchase < 0 ? "up" : "neutral") : undefined,
      color: m.costPerPurchase > 0 ? "amber" : undefined,
    },
  ];

  return {
    title: "Performance Overview",
    summary: `During this period, the account spent ${formatCurrency(m.spend, currency)} generating ${formatCurrency(m.conversionValue, currency)} in revenue at a ${formatRoas(m.roas)} ROAS. Total impressions reached ${formatNumber(m.impressions)} with a ${formatPercent(m.ctr)} click-through rate.`,
    metrics,
  };
}

function buildCampaignsSection(
  campaigns: CampaignRow[],
  currency: string
): ReportSectionResult {
  const sorted = [...campaigns].sort((a, b) => b.insights.spend - a.insights.spend);
  const top = sorted.slice(0, 10);

  const chartData: DisplayChartInput = {
    type: "bar",
    title: "Campaign Spend Comparison",
    data: top.map((c) => ({
      name: c.name.length > 25 ? c.name.slice(0, 22) + "..." : c.name,
      spend: Math.round(c.insights.spend * 100) / 100,
      revenue: Math.round(c.insights.conversionValue * 100) / 100,
    })),
    metrics: ["spend", "revenue"],
    xAxisKey: "name",
  };

  const tableData: DisplayTableInput = {
    title: "Campaign Details",
    columns: [
      { key: "name", label: "Campaign", format: "text" },
      { key: "status", label: "Status", format: "text" },
      { key: "spend", label: "Spend", format: "currency" },
      { key: "roas", label: "ROAS", format: "number" },
      { key: "conversions", label: "Purchases", format: "number" },
      { key: "ctr", label: "CTR", format: "percent" },
    ],
    rows: top.map((c) => ({
      name: c.name,
      status: c.status,
      spend: c.insights.spend,
      roas: c.insights.roas,
      conversions: Math.round(c.insights.conversions),
      ctr: c.insights.ctr,
    })),
  };

  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
  return {
    title: "Campaign Performance",
    summary: `${campaigns.length} total campaigns (${activeCampaigns} active). Top performer: "${sorted[0]?.name ?? "N/A"}" with ${formatRoas(sorted[0]?.insights?.roas ?? 0)} ROAS.`,
    chartData,
    tableData,
  };
}

function buildDemographicsSection(
  rows: Awaited<ReturnType<typeof fetchDemographicBreakdown>>,
  currency: string
): ReportSectionResult {
  const top = rows.slice(0, 10);

  const chartData: DisplayChartInput = {
    type: "bar",
    title: "Spend by Age & Gender",
    data: top.map((r) => ({
      name: `${r.age} ${r.gender}`,
      spend: Math.round(r.spend * 100) / 100,
      roas: Math.round(r.roas * 100) / 100,
    })),
    metrics: ["spend"],
    xAxisKey: "name",
  };

  const tableData: DisplayTableInput = {
    title: "Demographic Breakdown",
    columns: [
      { key: "age", label: "Age", format: "text" },
      { key: "gender", label: "Gender", format: "text" },
      { key: "spend", label: "Spend", format: "currency" },
      { key: "roas", label: "ROAS", format: "number" },
      { key: "ctr", label: "CTR", format: "percent" },
      { key: "conversions", label: "Purchases", format: "number" },
    ],
    rows: top.map((r) => ({
      age: r.age,
      gender: r.gender,
      spend: r.spend,
      roas: r.roas,
      ctr: r.ctr,
      conversions: Math.round(r.conversions),
    })),
  };

  const bestRow = rows[0];
  return {
    title: "Audience Demographics",
    summary: bestRow
      ? `Best performing segment: ${bestRow.age} ${bestRow.gender} with ${formatCurrency(bestRow.spend, currency)} spend and ${formatRoas(bestRow.roas)} ROAS.`
      : "No demographic data available for this period.",
    chartData: rows.length > 0 ? chartData : undefined,
    tableData: rows.length > 0 ? tableData : undefined,
  };
}

function buildPlacementsSection(
  rows: Awaited<ReturnType<typeof fetchPlacementBreakdown>>,
  currency: string
): ReportSectionResult {
  const top = rows.slice(0, 10);

  const chartData: DisplayChartInput = {
    type: "pie",
    title: "Spend Distribution by Platform",
    data: aggregatePlatformSpend(rows),
    metrics: ["spend"],
    xAxisKey: "name",
  };

  const tableData: DisplayTableInput = {
    title: "Placement Performance",
    columns: [
      { key: "platform", label: "Platform", format: "text" },
      { key: "position", label: "Position", format: "text" },
      { key: "spend", label: "Spend", format: "currency" },
      { key: "roas", label: "ROAS", format: "number" },
      { key: "ctr", label: "CTR", format: "percent" },
      { key: "conversions", label: "Purchases", format: "number" },
    ],
    rows: top.map((r) => ({
      platform: r.platform,
      position: r.position,
      spend: r.spend,
      roas: r.roas,
      ctr: r.ctr,
      conversions: Math.round(r.conversions),
    })),
  };

  return {
    title: "Placement Analysis",
    summary: rows.length > 0
      ? `Ads are running across ${new Set(rows.map((r) => r.platform)).size} platform(s). Top placement: ${rows[0].platform} ${rows[0].position} with ${formatRoas(rows[0].roas)} ROAS.`
      : "No placement data available for this period.",
    chartData: rows.length > 0 ? chartData : undefined,
    tableData: rows.length > 0 ? tableData : undefined,
  };
}

function aggregatePlatformSpend(
  rows: Awaited<ReturnType<typeof fetchPlacementBreakdown>>
): Record<string, unknown>[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.platform, (map.get(r.platform) ?? 0) + r.spend);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, spend]) => ({ name, spend: Math.round(spend * 100) / 100 }));
}

function buildConversionsSection(
  events: Awaited<ReturnType<typeof fetchConversionBreakdown>>,
  currency: string
): ReportSectionResult {
  const funnelOrder = [
    "View Content", "Add to Cart", "Initiate Checkout",
    "Add Payment Info", "Purchase (pixel)", "Purchase (app/omni)",
  ];

  const funnelEvents = funnelOrder
    .map((label) => events.find((e) => e.label === label))
    .filter(Boolean) as Awaited<ReturnType<typeof fetchConversionBreakdown>>;

  const chartData: DisplayChartInput | undefined = funnelEvents.length >= 2
    ? {
        type: "bar",
        title: "Conversion Funnel",
        data: funnelEvents.map((e) => ({ name: e.label, count: e.count })),
        metrics: ["count"],
        xAxisKey: "name",
      }
    : undefined;

  const tableData: DisplayTableInput = {
    title: "All Conversion Events",
    columns: [
      { key: "label", label: "Event", format: "text" },
      { key: "category", label: "Type", format: "text" },
      { key: "count", label: "Count", format: "number" },
      { key: "value", label: "Revenue", format: "currency" },
    ],
    rows: events.map((e) => ({
      label: e.label,
      category: e.category,
      count: e.count,
      value: e.value,
    })),
  };

  const totalConversions = events.reduce((s, e) => s + e.count, 0);
  const totalRevenue = events.reduce((s, e) => s + e.value, 0);

  return {
    title: "Conversion Analysis",
    summary: `${events.length} tracked event types with ${formatNumber(totalConversions)} total conversions generating ${formatCurrency(totalRevenue, currency)} in attributable revenue.`,
    metrics: [
      { label: "Total Events", value: formatNumber(totalConversions) },
      { label: "Total Revenue", value: formatCurrency(totalRevenue, currency), color: "green" },
      { label: "Event Types", value: String(events.length) },
    ],
    chartData,
    tableData: events.length > 0 ? tableData : undefined,
  };
}

// ─── Audit score builder ────────────────────────────────────────────────────

function scoreMetric(value: number, thresholds: [number, number, number, number]): number {
  // thresholds: [excellent, good, average, belowAvg] — returns 0-100 score
  const [exc, good, avg, belowAvg] = thresholds;
  if (value >= exc) return 95;
  if (value >= good) return 80;
  if (value >= avg) return 60;
  if (value >= belowAvg) return 40;
  return 20;
}

function scoreMetricInverse(value: number, thresholds: [number, number, number, number]): number {
  // For metrics where lower is better (CPC, CPM, CPA)
  const [exc, good, avg, belowAvg] = thresholds;
  if (value <= exc) return 95;
  if (value <= good) return 80;
  if (value <= avg) return 60;
  if (value <= belowAvg) return 40;
  return 20;
}

function ratingLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs Work";
  if (score >= 20) return "Poor";
  return "Critical";
}

function scoreColor(score: number): string {
  if (score >= 70) return "green";
  if (score >= 50) return "blue";
  if (score >= 30) return "amber";
  return "red";
}

function buildAuditScoreSection(
  account: AccountSummary,
  campaigns: CampaignRow[],
  currency: string
): ReportSectionResult {
  const m = account.insights;

  // Score each dimension against Meta benchmarks
  const ctrScore = scoreMetric(m.ctr, [2.0, 1.2, 0.8, 0.5]);
  const cpcScore = scoreMetricInverse(m.cpc, [0.5, 1.0, 2.0, 3.0]);
  const cpmScore = scoreMetricInverse(m.cpm, [5, 10, 15, 20]);
  const roasScore = scoreMetric(m.roas, [8, 4, 2, 1]);
  const costEfficiency = Math.round((cpcScore + cpmScore + (m.costPerPurchase > 0 ? scoreMetricInverse(m.costPerPurchase, [10, 25, 50, 80]) : 50)) / 3);

  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");
  const creativeCount = activeCampaigns.length; // proxy for creative diversity
  const creativeScore = creativeCount >= 10 ? 85 : creativeCount >= 5 ? 65 : creativeCount >= 3 ? 45 : 25;
  const creativePerformance = Math.round((ctrScore + creativeScore) / 2);

  const convRate = m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0;
  const convRateScore = scoreMetric(convRate, [10, 5, 2, 1]);
  const conversionQuality = Math.round((convRateScore + roasScore) / 2);

  // Audience targeting — based on demographic/placement efficiency we can infer
  const audienceTargeting = Math.round((ctrScore + roasScore + 50) / 3); // 50 = neutral baseline for targeting precision

  // Budget optimization
  const budgetPerCampaign = activeCampaigns.length > 0 ? m.spend / activeCampaigns.length : 0;
  const budgetScore = budgetPerCampaign > 100 ? 70 : budgetPerCampaign > 50 ? 50 : 30;
  const budgetOptimization = Math.round((budgetScore + (m.roas >= 2 ? 70 : 40)) / 2);

  const overall = Math.round(
    costEfficiency * 0.25 +
    creativePerformance * 0.20 +
    conversionQuality * 0.25 +
    audienceTargeting * 0.15 +
    budgetOptimization * 0.15
  );

  const metrics: MetricItem[] = [
    { label: "Overall Score", value: `${overall}/100`, color: scoreColor(overall) },
    { label: "Cost Efficiency", value: `${costEfficiency}/100`, subtitle: "25% weight", color: scoreColor(costEfficiency) },
    { label: "Creative Perf.", value: `${creativePerformance}/100`, subtitle: "20% weight", color: scoreColor(creativePerformance) },
    { label: "Conversion Quality", value: `${conversionQuality}/100`, subtitle: "25% weight", color: scoreColor(conversionQuality) },
    { label: "Audience Targeting", value: `${audienceTargeting}/100`, subtitle: "15% weight", color: scoreColor(audienceTargeting) },
    { label: "Budget Optimization", value: `${budgetOptimization}/100`, subtitle: "15% weight", color: scoreColor(budgetOptimization) },
  ];

  const tableData: DisplayTableInput = {
    title: "Benchmark Comparison",
    columns: [
      { key: "metric", label: "Metric", format: "text" },
      { key: "value", label: "Your Value", format: "text" },
      { key: "benchmark", label: "Meta Benchmark", format: "text" },
      { key: "rating", label: "Rating", format: "text" },
    ],
    rows: [
      { metric: "CTR (Link)", value: formatPercent(m.ctr), benchmark: "0.8–1.2% (Avg)", rating: ratingLabel(ctrScore) },
      { metric: "CPC (Link)", value: formatCurrency(m.cpc, currency), benchmark: "$1–2 (Avg)", rating: ratingLabel(cpcScore) },
      { metric: "CPM", value: formatCurrency(m.cpm, currency), benchmark: "$10–15 (Avg)", rating: ratingLabel(cpmScore) },
      { metric: "ROAS", value: formatRoas(m.roas), benchmark: "2–4x (Avg)", rating: ratingLabel(roasScore) },
      { metric: "Conv. Rate", value: formatPercent(convRate), benchmark: "2–5% (Avg)", rating: ratingLabel(convRateScore) },
      { metric: "Cost/Purchase", value: m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, currency) : "N/A", benchmark: "$25–50 (Avg)", rating: m.costPerPurchase > 0 ? ratingLabel(scoreMetricInverse(m.costPerPurchase, [10, 25, 50, 80])) : "N/A" },
    ],
  };

  return {
    title: "Performance Audit Score",
    summary: `Overall score: ${overall}/100 (${ratingLabel(overall)}). ${overall >= 60 ? "Solid foundation with optimization opportunities." : "Significant improvements needed across multiple dimensions."}`,
    metrics,
    tableData,
  };
}

// ─── Andromeda strategy builder ─────────────────────────────────────────────

function buildAndromedaSection(
  account: AccountSummary,
  campaigns: CampaignRow[],
  currency: string
): ReportSectionResult {
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");
  const m = account.insights;

  // Assess each Andromeda principle
  const creativeCount = activeCampaigns.length;
  const creativeHealth = creativeCount >= 10 ? "Healthy" : creativeCount >= 5 ? "Moderate" : "Low";
  const creativeColor = creativeCount >= 10 ? "green" : creativeCount >= 5 ? "amber" : "red";

  // Check for signs of creative fatigue
  const hasFatigueSignals = m.ctr < 0.8 || (account.delta?.ctr != null && account.delta.ctr < -15);
  const fatigueStatus = hasFatigueSignals ? "Fatigue signals detected" : "No major fatigue signals";

  // Targeting assessment — check campaign diversity of objectives
  const objectives = new Set(activeCampaigns.map((c) => c.objective));

  // Consolidation — fewer campaigns is better in Andromeda era
  const consolidationScore = activeCampaigns.length <= 3 ? "Well Consolidated" :
    activeCampaigns.length <= 6 ? "Moderate" : "Over-Fragmented";
  const consolidationColor = activeCampaigns.length <= 3 ? "green" :
    activeCampaigns.length <= 6 ? "amber" : "red";

  // Budget concentration — are winners getting most spend?
  const sorted = [...activeCampaigns].sort((a, b) => b.insights.spend - a.insights.spend);
  const topSpend = sorted.slice(0, 3).reduce((s, c) => s + c.insights.spend, 0);
  const totalSpend = activeCampaigns.reduce((s, c) => s + c.insights.spend, 0);
  const topConcentration = totalSpend > 0 ? (topSpend / totalSpend) * 100 : 0;

  const metrics: MetricItem[] = [
    { label: "Creative Volume", value: `${creativeCount} active`, subtitle: creativeHealth, color: creativeColor },
    { label: "Consolidation", value: `${activeCampaigns.length} campaigns`, subtitle: consolidationScore, color: consolidationColor },
    { label: "Creative Fatigue", value: hasFatigueSignals ? "At Risk" : "Healthy", color: hasFatigueSignals ? "red" : "green" },
    { label: "Budget Focus", value: `${Math.round(topConcentration)}% in top 3`, subtitle: topConcentration > 70 ? "Good focus" : "Spread thin", color: topConcentration > 70 ? "green" : "amber" },
  ];

  const tableData: DisplayTableInput = {
    title: "Andromeda Strategy Assessment",
    columns: [
      { key: "principle", label: "Principle", format: "text" },
      { key: "status", label: "Current Status", format: "text" },
      { key: "recommendation", label: "Recommendation", format: "text" },
      { key: "priority", label: "Priority", format: "text" },
    ],
    rows: [
      {
        principle: "Creative Diversity",
        status: `${creativeCount} active campaigns (proxy for creative concepts)`,
        recommendation: creativeCount < 5 ? "Produce 5-10+ diverse creative concepts per campaign — different hooks, formats, angles" : "Continue refreshing creatives regularly to prevent fatigue",
        priority: creativeCount < 5 ? "High" : "Medium",
      },
      {
        principle: "Broad Targeting",
        status: `${objectives.size} objective type(s) across ${activeCampaigns.length} campaigns`,
        recommendation: activeCampaigns.length > 5 ? "Consolidate campaigns — let the algorithm find buyers with broad targeting" : "Maintain broad targeting, avoid interest-based micro-segmentation",
        priority: activeCampaigns.length > 5 ? "High" : "Low",
      },
      {
        principle: "Creative Fatigue",
        status: fatigueStatus,
        recommendation: hasFatigueSignals ? "CTR declining — refresh creative immediately with new concepts, not minor variations" : "Monitor CTR weekly for early fatigue signals",
        priority: hasFatigueSignals ? "High" : "Low",
      },
      {
        principle: "Test → Scale Pipeline",
        status: activeCampaigns.length === 1 ? "Single campaign (no pipeline)" : `${activeCampaigns.length} campaigns — verify test/scale separation`,
        recommendation: "Dedicate 15-20% budget to testing new creatives, graduate winners to scaling campaign",
        priority: "Medium",
      },
      {
        principle: "Prospecting vs Retargeting",
        status: "Verify exclusion of existing customers from prospecting campaigns",
        recommendation: "Ensure past purchasers are excluded from prospecting. Target 70-80% prospecting / 20-30% retargeting budget split",
        priority: "High",
      },
    ],
  };

  return {
    title: "Andromeda Strategy Insights",
    summary: `Creative volume: ${creativeHealth} (${creativeCount} active). Consolidation: ${consolidationScore}. ${hasFatigueSignals ? "Creative fatigue signals detected — refresh needed." : "No major fatigue signals."} Top 3 campaigns capture ${Math.round(topConcentration)}% of spend.`,
    metrics,
    tableData,
  };
}

// ─── Campaign structure builder ─────────────────────────────────────────────

function buildCampaignStructureSection(
  campaigns: CampaignRow[],
  account: AccountSummary,
  currency: string
): ReportSectionResult {
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");
  const totalSpend = activeCampaigns.reduce((s, c) => s + c.insights.spend, 0);
  const totalConversions = activeCampaigns.reduce((s, c) => s + c.insights.conversions, 0);
  const objectives = new Set(activeCampaigns.map((c) => c.objective));

  // Determine recommended structure based on account characteristics
  let recommendedStructure: string;
  let structureLayout: string;
  let structureReason: string;

  if (activeCampaigns.length <= 2 && objectives.size === 1) {
    recommendedStructure = "A — Consolidated (Current fit)";
    structureLayout = "1 Campaign → 1 Ad Set → 20+ diverse ads";
    structureReason = "Account is already well-consolidated. Focus on adding creative volume within existing structure.";
  } else if (objectives.size >= 3) {
    recommendedStructure = "B — Product/Service Split";
    structureLayout = "1 Campaign per objective/product → 1 Ad Set each → 20+ ads per ad set";
    structureReason = "Multiple objectives detected — separate campaigns per product/service for independent optimization.";
  } else if (totalConversions > 100 && activeCampaigns.length >= 3) {
    recommendedStructure = "C — Testing + Scaling Pipeline";
    structureLayout = "Testing Campaign (15-20% budget) + Scaling Campaign (80-85% budget) + Optional Retargeting";
    structureReason = "Sufficient conversion volume to support a test/scale pipeline. Graduate winners from testing to scaling.";
  } else {
    recommendedStructure = "A — Consolidated";
    structureLayout = "1 Campaign → 1 Ad Set → 20+ diverse ads";
    structureReason = "Consolidate to maximize conversion data per ad set for better optimization.";
  }

  const metrics: MetricItem[] = [
    { label: "Active Campaigns", value: String(activeCampaigns.length), color: activeCampaigns.length <= 3 ? "green" : activeCampaigns.length <= 6 ? "amber" : "red" },
    { label: "Objective Types", value: String(objectives.size), subtitle: [...objectives].join(", ") },
    { label: "Total Conversions", value: formatNumber(Math.round(totalConversions)), subtitle: "Current period" },
    { label: "Recommended", value: recommendedStructure.split(" — ")[0], subtitle: recommendedStructure.split(" — ")[1] ?? "", color: "purple" },
  ];

  const tableData: DisplayTableInput = {
    title: "Structure Evaluation",
    columns: [
      { key: "dimension", label: "Dimension", format: "text" },
      { key: "current", label: "Current State", format: "text" },
      { key: "recommendation", label: "Recommendation", format: "text" },
      { key: "priority", label: "Priority", format: "text" },
    ],
    rows: [
      {
        dimension: "Consolidation",
        current: `${activeCampaigns.length} campaigns`,
        recommendation: activeCampaigns.length > 3 ? "Consolidate to 1-3 campaigns for better optimization" : "Good — maintain current consolidation",
        priority: activeCampaigns.length > 3 ? "High" : "Low",
      },
      {
        dimension: "Creative Volume",
        current: `${activeCampaigns.length} campaigns as proxy`,
        recommendation: "Target 20+ diverse ads per ad set — images, videos, UGC, testimonials",
        priority: "High",
      },
      {
        dimension: "Ad Copy Testing",
        current: "Verify in Ads Manager",
        recommendation: "Use 5x headline + 5x primary text variations per ad, not separate ads for copy tests",
        priority: "Medium",
      },
      {
        dimension: "Funnel Stages",
        current: objectives.size > 1 ? "Multiple objectives" : "Single objective",
        recommendation: "Include TOF/MOF/BOF creative within one ad set — Meta auto-sequences. Don't split into separate campaigns",
        priority: objectives.size > 1 ? "High" : "Low",
      },
      {
        dimension: "Audience Separation",
        current: "Verify in Ads Manager",
        recommendation: "Don't separate cold/warm audiences — Meta overrides suggestions. Only separate by location (Controls, not Suggestions)",
        priority: "Medium",
      },
    ],
  };

  const chartData: DisplayChartInput = {
    type: "bar",
    title: "Campaign Spend & ROAS",
    data: activeCampaigns
      .sort((a, b) => b.insights.spend - a.insights.spend)
      .slice(0, 8)
      .map((c) => ({
        name: c.name.length > 20 ? c.name.slice(0, 17) + "..." : c.name,
        spend: Math.round(c.insights.spend * 100) / 100,
        roas: Math.round(c.insights.roas * 100) / 100,
      })),
    metrics: ["spend", "roas"],
    xAxisKey: "name",
  };

  return {
    title: "Campaign Structure Assessment",
    summary: `Recommended structure: ${recommendedStructure}. ${structureReason} Layout: ${structureLayout}.`,
    metrics,
    chartData: activeCampaigns.length > 0 ? chartData : undefined,
    tableData,
  };
}

// ─── Landing page builder ───────────────────────────────────────────────────

async function buildLandingPageSection(
  url: string | undefined
): Promise<ReportSectionResult> {
  if (!url) {
    return {
      title: "Landing Page Analysis",
      summary: "No landing page URL was provided. Provide a URL to include a conversion audit of your landing page.",
    };
  }

  const safeDisplayUrl = sanitizeUrlForDisplay(url);

  try {
    const safeUrl = await validateExternalUrl(url);

    const pageRes = await fetch(safeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgencyCollective/1.0; +https://agencycollective.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!pageRes.ok) {
      return {
        title: "Landing Page Analysis",
        summary: `Could not fetch landing page (HTTP ${pageRes.status}). Verify the URL is accessible: ${safeDisplayUrl}`,
      };
    }

    let html = await pageRes.text();
    // Cap raw HTML to 2MB before processing to prevent regex DoS
    if (html.length > 2_000_000) {
      html = html.slice(0, 2_000_000);
    }

    // Extract key elements
    const titleMatch = html.match(new RegExp("<title[^>]*>([\\s\\S]*?)<\\/title>", "i"));
    const metaDescMatch = html.match(new RegExp('<meta[^>]*name="description"[^>]*content="([^"]*)"', "i"));
    const h1Matches = html.match(new RegExp("<h1[^>]*>([\\s\\S]*?)<\\/h1>", "gi")) ?? [];
    const ctaMatches = html.match(new RegExp("<button[^>]*>([\\s\\S]*?)<\\/button>", "gi")) ?? [];
    const formMatches = html.match(new RegExp("<form[\\s\\S]*?<\\/form>", "gi")) ?? [];
    const inputMatches = html.match(new RegExp("<input[^>]*>", "gi")) ?? [];
    const imgMatches = html.match(new RegExp("<img[^>]*>", "gi")) ?? [];
    const testimonialHints = (html.match(new RegExp("testimonial|review|rating|stars|customer said", "gi")) ?? []).length;

    const stripTags = (s: string) => s.replace(new RegExp("<[^>]+>", "g"), "").trim();
    const pageTitle = titleMatch ? stripTags(titleMatch[1]) : "Not found";
    const metaDesc = metaDescMatch ? metaDescMatch[1] : "Not found";
    const headlines = h1Matches.map(stripTags).filter(Boolean);
    const ctas = ctaMatches.map(stripTags).filter(Boolean);
    const formFieldCount = inputMatches.filter((i) => !new RegExp('type="hidden"', "i").test(i)).length;
    const formCount = formMatches.length;

    // Score each category
    const hasHeadline = headlines.length > 0;
    const headlineSpecific = hasHeadline && headlines[0].split(" ").length >= 3 && headlines[0].split(" ").length <= 15;
    const messageMatchScore = headlineSpecific ? 70 : hasHeadline ? 45 : 15;

    const hasCta = ctas.length > 0;
    const ctaSpecific = hasCta && !["submit", "click here", "learn more", "send"].includes(ctas[0].toLowerCase());
    const ctaScore = ctaSpecific ? 75 : hasCta ? 50 : 15;

    const trustScore = testimonialHints >= 3 ? 75 : testimonialHints >= 1 ? 50 : 20;

    const aboveFoldScore = hasHeadline && hasCta ? 70 : hasHeadline ? 45 : 20;

    const copyLength = html.replace(new RegExp("<[^>]+>", "g"), "").length;
    const copyScore = copyLength > 2000 ? 65 : copyLength > 500 ? 50 : 30;

    const formScore = formCount === 0 ? 80 : formFieldCount <= 3 ? 75 : formFieldCount <= 5 ? 55 : formFieldCount <= 7 ? 35 : 20;

    const hasViewport = new RegExp('name="viewport"', "i").test(html);
    const mobileScore = hasViewport ? 65 : 30;

    const htmlSize = html.length;
    const speedScore = htmlSize < 100000 ? 75 : htmlSize < 300000 ? 55 : htmlSize < 500000 ? 35 : 20;

    const overall = Math.round(
      messageMatchScore * 0.20 +
      ctaScore * 0.20 +
      trustScore * 0.15 +
      aboveFoldScore * 0.15 +
      copyScore * 0.10 +
      formScore * 0.10 +
      mobileScore * 0.05 +
      speedScore * 0.05
    );

    const metrics: MetricItem[] = [
      { label: "Overall Score", value: `${overall}/100`, color: scoreColor(overall) },
      { label: "Message Match", value: `${messageMatchScore}/100`, color: scoreColor(messageMatchScore) },
      { label: "CTA Clarity", value: `${ctaScore}/100`, color: scoreColor(ctaScore) },
      { label: "Trust Signals", value: `${trustScore}/100`, color: scoreColor(trustScore) },
    ];

    const tableData: DisplayTableInput = {
      title: "Landing Page Scorecard",
      columns: [
        { key: "category", label: "Category", format: "text" },
        { key: "score", label: "Score", format: "text" },
        { key: "rating", label: "Rating", format: "text" },
        { key: "finding", label: "Key Finding", format: "text" },
      ],
      rows: [
        { category: "Message Match", score: `${messageMatchScore}/100`, rating: ratingLabel(messageMatchScore), finding: hasHeadline ? `Headline: "${headlines[0]?.slice(0, 60)}"` : "No H1 headline found" },
        { category: "CTA Clarity", score: `${ctaScore}/100`, rating: ratingLabel(ctaScore), finding: hasCta ? `${ctas.length} CTA(s) found: "${ctas[0]?.slice(0, 40)}"` : "No CTA buttons found" },
        { category: "Trust & Social Proof", score: `${trustScore}/100`, rating: ratingLabel(trustScore), finding: `${testimonialHints} trust signal indicator(s) detected` },
        { category: "Above-the-Fold", score: `${aboveFoldScore}/100`, rating: ratingLabel(aboveFoldScore), finding: `Headline: ${hasHeadline ? "Yes" : "No"} | CTA above fold: ${hasCta ? "Likely" : "No"}` },
        { category: "Copy Quality", score: `${copyScore}/100`, rating: ratingLabel(copyScore), finding: `~${Math.round(copyLength / 5)} words of content` },
        { category: "Form & Friction", score: `${formScore}/100`, rating: ratingLabel(formScore), finding: formCount > 0 ? `${formCount} form(s) with ${formFieldCount} visible field(s)` : "No forms detected" },
        { category: "Mobile", score: `${mobileScore}/100`, rating: ratingLabel(mobileScore), finding: hasViewport ? "Viewport meta tag present" : "Missing viewport meta — not mobile-optimized" },
        { category: "Page Speed", score: `${speedScore}/100`, rating: ratingLabel(speedScore), finding: `HTML size: ${Math.round(htmlSize / 1024)}KB` },
      ],
    };

    return {
      title: "Landing Page Analysis",
      summary: `${safeDisplayUrl} — Overall score: ${overall}/100 (${ratingLabel(overall)}). Page title: "${pageTitle}". ${formCount > 0 ? `${formFieldCount} form fields detected.` : "No forms."} ${ctas.length} CTA button(s). ${testimonialHints > 0 ? `${testimonialHints} trust signal(s).` : "No trust signals found."}`,
      metrics,
      tableData,
    };
  } catch (err) {
    return {
      title: "Landing Page Analysis",
      summary: `Failed to analyze landing page: ${err instanceof Error ? err.message : "Unknown error"}. URL: ${safeDisplayUrl}`,
    };
  }
}

// ─── Main report generator ───────────────────────────────────────────────────

export async function generateReport(input: {
  clientName: string;
  accountId: string;
  period: string;
  sections: ReportSection[];
  landingPageUrl?: string;
}): Promise<ReportResult> {
  if (!input.clientName?.trim()) throw new Error("clientName is required");
  if (!input.accountId?.trim()) throw new Error("accountId is required");
  if (!input.sections?.length) throw new Error("At least one section is required");

  const dateRange = parsePeriodToDateRange(input.period);

  const account = await getAccountSummary(input.accountId, dateRange);
  if (!account) {
    throw new Error(`Account ${input.accountId} not found. Verify the account ID is correct.`);
  }

  const currency = account.currency;
  const sectionResults: ReportSectionResult[] = [];

  for (const section of input.sections) {
    switch (section) {
      case "overview": {
        sectionResults.push(buildOverviewSection(account, currency));
        break;
      }
      case "campaigns": {
        const campaigns = await getCampaigns(input.accountId, dateRange);
        sectionResults.push(buildCampaignsSection(campaigns, currency));
        break;
      }
      case "demographics": {
        const rows = await fetchDemographicBreakdown(input.accountId, dateRange).catch((err) => {
          console.warn(`[report] Failed to fetch demographics for ${input.accountId}:`, err instanceof Error ? err.message : err);
          return [];
        });
        sectionResults.push(buildDemographicsSection(rows, currency));
        break;
      }
      case "placements": {
        const rows = await fetchPlacementBreakdown(input.accountId, dateRange).catch((err) => {
          console.warn(`[report] Failed to fetch placements for ${input.accountId}:`, err instanceof Error ? err.message : err);
          return [];
        });
        sectionResults.push(buildPlacementsSection(rows, currency));
        break;
      }
      case "conversions": {
        const customConvs = await fetchCustomConversions(input.accountId).catch((err) => {
          console.warn(`[report] Failed to fetch custom conversions for ${input.accountId}:`, err instanceof Error ? err.message : err);
          return [];
        });
        const events = await fetchConversionBreakdown(input.accountId, dateRange, customConvs).catch((err) => {
          console.warn(`[report] Failed to fetch conversion breakdown for ${input.accountId}:`, err instanceof Error ? err.message : err);
          return [];
        });
        sectionResults.push(buildConversionsSection(events, currency));
        break;
      }
      case "recommendations": {
        // Recommendations are generated by Claude's response text after the tool call
        sectionResults.push({
          title: "AI Recommendations",
          summary: "See the analyst's recommendations below this report.",
        });
        break;
      }
      case "audit_score": {
        const auditCampaigns = await getCampaigns(input.accountId, dateRange);
        sectionResults.push(buildAuditScoreSection(account, auditCampaigns, currency));
        break;
      }
      case "andromeda": {
        const andromedaCampaigns = await getCampaigns(input.accountId, dateRange);
        sectionResults.push(buildAndromedaSection(account, andromedaCampaigns, currency));
        break;
      }
      case "campaign_structure": {
        const structureCampaigns = await getCampaigns(input.accountId, dateRange);
        sectionResults.push(buildCampaignStructureSection(structureCampaigns, account, currency));
        break;
      }
      case "landing_page": {
        sectionResults.push(await buildLandingPageSection(input.landingPageUrl));
        break;
      }
    }
  }

  return {
    title: `${input.clientName} — Performance Report`,
    clientName: input.clientName,
    period: input.period,
    generatedAt: new Date().toISOString(),
    sections: sectionResults,
  };
}
