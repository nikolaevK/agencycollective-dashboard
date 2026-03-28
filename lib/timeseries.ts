import { aggregateInsights } from "@/lib/meta/transformers";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";

/**
 * Merge multiple per-account daily time series into one aggregated series.
 * For each date, sums additive metrics and recalculates ratios via aggregateInsights().
 */
export function mergeTimeSeries(
  seriesArr: (TimeSeriesDataPoint[] | undefined)[]
): TimeSeriesDataPoint[] {
  const byDate = new Map<string, InsightMetrics[]>();

  for (const series of seriesArr) {
    if (!series) continue;
    for (const pt of series) {
      let arr = byDate.get(pt.date);
      if (!arr) {
        arr = [];
        byDate.set(pt.date, arr);
      }
      arr.push({
        spend: pt.spend,
        impressions: pt.impressions,
        reach: pt.reach,
        clicks: pt.clicks,
        ctr: pt.ctr,
        cpc: pt.cpc,
        cpm: pt.cpm,
        roas: pt.roas,
        conversions: pt.conversions,
        conversionValue: pt.conversionValue,
        costPerPurchase: pt.costPerPurchase,
      });
    }
  }

  const merged: TimeSeriesDataPoint[] = [];
  for (const [date, metrics] of byDate) {
    const agg = aggregateInsights(metrics);
    merged.push({ date, ...agg });
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date));
}
