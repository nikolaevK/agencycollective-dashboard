"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Banknote,
  CreditCard,
  DollarSign,
  Eye,
  Instagram,
  MousePointerClick,
  Repeat,
  ShoppingCart,
  Tag,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { MetricSparkline as MetricSparklineType } from "@/components/shared/MetricSparkline";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { StatCard } from "@/components/overview/StatCard";
import { cn, formatCurrency, formatNumber, formatPercent, formatRoas } from "@/lib/utils";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";

type MetricKey = keyof InsightMetrics;

interface KpiDef {
  key: MetricKey;
  label: string;
  icon: LucideIcon;
  /** Money metrics are formatted in the account's currency. */
  money?: boolean;
  format?: (v: number) => string;
  /** A rise is bad (costs, frequency) — the Δ chip reads green on a drop. */
  lowerIsBetter?: boolean;
  primary?: boolean;
  /** Hidden when the value is 0 (only tracked for some accounts). */
  hideWhenZero?: boolean;
  /** Revenue-side metrics draw in the "paid" chart color. */
  revenue?: boolean;
  /** A ratio is undefined without its denominator (no spend → no ROAS);
   *  0 there isn't a change worth a Δ chip. */
  defined?: (m: InsightMetrics) => boolean;
  info: string;
}

const KPIS: KpiDef[] = [
  {
    key: "spend",
    label: "Amount spent",
    icon: DollarSign,
    money: true,
    primary: true,
    info: "Total ad spend for the selected period. Compare against revenue to assess overall efficiency.",
  },
  {
    key: "roas",
    label: "ROAS",
    icon: Target,
    format: formatRoas,
    primary: true,
    revenue: true,
    defined: (m) => m.spend > 0,
    info: "Return on Ad Spend — revenue generated per dollar spent. Benchmark: <1x Poor · 2–4x Avg · >8x Excellent.",
  },
  {
    key: "conversions",
    label: "Purchases",
    icon: ShoppingCart,
    format: formatNumber,
    primary: true,
    info: "Total purchase conversions attributed to ads via Meta Pixel. Includes only fb_pixel_purchase events.",
  },
  {
    key: "conversionValue",
    label: "Purchase value",
    icon: Banknote,
    money: true,
    primary: true,
    revenue: true,
    info: "Total revenue from ad-attributed purchases. Used to calculate ROAS (Purchase Value ÷ Spend).",
  },
  {
    key: "costPerPurchase",
    label: "Cost / purchase",
    icon: Tag,
    money: true,
    lowerIsBetter: true,
    primary: true,
    defined: (m) => m.conversions > 0,
    info: "Average cost to acquire one purchase (Spend ÷ Purchases). Benchmark: >$80 Poor · $25–50 Avg · <$10 Excellent.",
  },
  {
    key: "impressions",
    label: "Impressions",
    icon: Eye,
    format: formatNumber,
    info: "Total number of times your ads were shown. One person may see your ad multiple times (see Frequency).",
  },
  {
    key: "reach",
    label: "Reach",
    icon: Users,
    format: formatNumber,
    info: "Number of unique people who saw your ads at least once. Reach = Impressions ÷ Frequency.",
  },
  {
    key: "ctr",
    label: "CTR",
    icon: MousePointerClick,
    format: (v) => formatPercent(v),
    defined: (m) => m.impressions > 0,
    info: "Click-Through Rate — percentage of impressions that resulted in a click. Benchmark: <0.5% Poor · 0.8–1.2% Avg · >2% Excellent.",
  },
  {
    key: "cpc",
    label: "CPC",
    icon: CreditCard,
    money: true,
    lowerIsBetter: true,
    defined: (m) => m.clicks > 0,
    info: "Cost Per Click — average cost for each link click. Benchmark: >$3 Poor · $1–2 Avg · <$0.50 Excellent.",
  },
  {
    key: "frequency",
    label: "Frequency",
    icon: Repeat,
    format: (v) => v.toFixed(1),
    lowerIsBetter: true,
    defined: (m) => m.reach > 0,
    info: "Average times each person saw your ad. High frequency signals creative fatigue. Benchmark: >5 Poor · 2–3 Avg · 1–1.5 Excellent. Over 3 = consider refreshing creative.",
  },
  {
    key: "instagramProfileVisits",
    label: "IG profile visits",
    icon: Instagram,
    format: formatNumber,
    hideWhenZero: true,
    info: "Instagram profile visits attributed to your ads. Only tracked when an Instagram profile is connected to the ad account.",
  },
];

// Theme chart pair (globals.css), as on the Closers overview: volume/cost =
// chart-1, revenue-side = chart-2.
const VOLUME_COLOR = "hsl(var(--chart-1))";
const REVENUE_COLOR = "hsl(var(--chart-2))";

type CardTrend = Omit<React.ComponentProps<typeof MetricSparklineType>, "label">;

// Recharts loads only where trend lines are drawn — the campaign / ad set
// pages show these cards without them. The placeholder keeps the card height.
const MetricSparkline = dynamic(
  () => import("@/components/shared/MetricSparkline").then((m) => m.MetricSparkline),
  { loading: () => <SparklinePlaceholder /> }
);

interface MetaKpiCardsProps {
  metrics?: InsightMetrics;
  /** The previous same-length period — powers the Δ chips. */
  previous?: InsightMetrics | null;
  /** Daily rows for the card trend lines. */
  timeSeries?: TimeSeriesDataPoint[];
  /** Reserve the trend-line space (the series is loading or will load). */
  showTrend?: boolean;
  currency?: string;
  isLoading?: boolean;
}

/**
 * Meta KPI cards for the admin Overview and its account / campaign / ad set
 * pages: the five headline metrics, then the delivery metrics. Each card has
 * a Δ chip against the previous period (when known) and a per-day trend line
 * (when a daily series is passed).
 */
export function MetaKpiCards({
  metrics,
  previous,
  timeSeries,
  showTrend,
  currency = "USD",
  isLoading,
}: MetaKpiCardsProps) {
  // Built per data change: the (memoized) sparklines compare these objects.
  const trends = useMemo(() => {
    const out = new Map<MetricKey, CardTrend>();
    const rows = [...(timeSeries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    if (!showTrend || rows.length < 2) return out;
    const day = (ymd: string) => format(parseISO(ymd), "MMM d");
    const caption = `${day(rows[0].date)} – ${day(rows[rows.length - 1].date)}`;
    const labels = rows.map((r) => format(parseISO(r.date), "EEE, MMM d"));
    for (const kpi of KPIS) {
      out.set(kpi.key, {
        points: rows.map((r, i) => ({ label: labels[i], value: r[kpi.key] as number })),
        color: kpi.revenue ? REVENUE_COLOR : VOLUME_COLOR,
        format: kpi.money ? (v: number) => formatCurrency(v, currency) : (kpi.format ?? String),
        caption,
        hint: "Per day",
      });
    }
    return out;
  }, [timeSeries, showTrend, currency]);

  if (!isLoading && !metrics) return null;

  const visible = KPIS.filter((k) => !k.hideWhenZero || (metrics?.[k.key] ?? 0) !== 0);
  const groups = [visible.filter((k) => k.primary), visible.filter((k) => !k.primary)];

  return (
    <div className="space-y-4">
      {groups.map((group, g) => (
        <div
          key={g}
          className={cn(
            // One column on the narrowest phones; six only where labels fit.
            "grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 lg:grid-cols-3",
            group.length > 5 ? "2xl:grid-cols-6" : "xl:grid-cols-5"
          )}
        >
          {group.map((kpi, i) => {
            const value = metrics?.[kpi.key] ?? 0;
            const showDelta =
              metrics && previous && (!kpi.defined || (kpi.defined(metrics) && kpi.defined(previous)));
            const trend = trends.get(kpi.key);
            return (
              <StatCard
                key={kpi.key}
                label={kpi.label}
                icon={kpi.icon}
                info={kpi.info}
                isLoading={isLoading}
                value={kpi.money ? formatCurrency(value, currency) : (kpi.format ?? String)(value)}
                delta={
                  showDelta ? (
                    <TrendDelta current={value} previous={previous[kpi.key]} lowerIsBetter={kpi.lowerIsBetter} />
                  ) : undefined
                }
                // An odd last card spans the row on the 2-column phone grid.
                className={cn(
                  group.length % 2 === 1 && i === group.length - 1 && "min-[360px]:col-span-2 lg:col-span-1"
                )}
                // The icon is decoration: drop it where the row's columns are
                // too narrow for labels like "Purchase value" next to it.
                iconClassName={cn(
                  "max-sm:hidden",
                  group.length > 5 ? "2xl:hidden" : "xl:max-2xl:hidden"
                )}
              >
                {trend ? (
                  <MetricSparkline label={kpi.label} {...trend} />
                ) : (
                  // The series is still loading: keep the space, mount no chart.
                  showTrend && !timeSeries && <SparklinePlaceholder />
                )}
              </StatCard>
            );
          })}
        </div>
      ))}
    </div>
  );
}
