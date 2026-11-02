"use client";

import { memo, useId, useMemo, useState } from "react";
// AreaChart, not ComposedChart: the latter always pulls in Line/Bar/Scatter.
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { AlertTriangle, LineChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCurrency, formatCurrencyCompact, formatNumber, formatPercent, formatRoas } from "@/lib/utils";
import type { TimeSeriesDataPoint } from "@/types/dashboard";

type SeriesKey =
  | "spend"
  | "conversionValue"
  | "roas"
  | "conversions"
  | "costPerPurchase"
  | "impressions"
  | "reach"
  | "clicks"
  | "ctr"
  | "cpc";
type Unit = "money" | "roas" | "count" | "percent";

// One unit per view, so every view has a single y-axis. "Spend & revenue"
// pairs the two money series (blue spend vs emerald purchase value, the
// theme's closed/paid pair).
const VIEWS = [
  { id: "revenue", label: "Spend & revenue", series: ["spend", "conversionValue"], unit: "money" },
  { id: "roas", label: "ROAS", series: ["roas"], unit: "roas" },
  { id: "conversions", label: "Purchases", series: ["conversions"], unit: "count" },
  { id: "costPerPurchase", label: "Cost / purchase", series: ["costPerPurchase"], unit: "money" },
  // Delivery + traffic counts (the client portal's old chart plotted these).
  { id: "reach", label: "Reach", series: ["impressions", "reach"], unit: "count" },
  { id: "clicks", label: "Clicks", series: ["clicks"], unit: "count" },
  { id: "ctr", label: "CTR", series: ["ctr"], unit: "percent" },
  { id: "cpc", label: "CPC", series: ["cpc"], unit: "money" },
] as const satisfies readonly { id: string; label: string; series: readonly SeriesKey[]; unit: Unit }[];

type ViewId = (typeof VIEWS)[number]["id"];

const chartConfig = {
  spend: { label: "Amount spent", color: "hsl(var(--chart-1))" },
  conversionValue: { label: "Purchase value", color: "hsl(var(--chart-2))" },
  roas: { label: "ROAS", color: "hsl(var(--chart-2))" },
  conversions: { label: "Purchases", color: "hsl(var(--chart-1))" },
  costPerPurchase: { label: "Cost per purchase", color: "hsl(var(--chart-1))" },
  impressions: { label: "Impressions", color: "hsl(var(--chart-1))" },
  reach: { label: "Reach", color: "hsl(var(--chart-2))" },
  clicks: { label: "Clicks", color: "hsl(var(--chart-1))" },
  ctr: { label: "CTR", color: "hsl(var(--chart-1))" },
  cpc: { label: "CPC", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

interface MetaPerformanceChartProps {
  data?: TimeSeriesDataPoint[];
  isLoading?: boolean;
  error?: Error | null;
  currency?: string;
  /** Under the title, e.g. "Last 7 days · 12 accounts". */
  description?: string;
  /** Right side of the header (e.g. a link). */
  action?: React.ReactNode;
  /** Replaces the "No data for this period" message. */
  emptyText?: string;
}

/**
 * Daily Meta performance, one metric family at a time (a toggle), so a view
 * never mixes units on one axis. Shared by the Overview (all accounts) and
 * the account page. Memoized: the Overview re-renders as each of its other
 * queries lands, and a new data array would replay the chart's animation.
 */
export const MetaPerformanceChart = memo(function MetaPerformanceChart({
  data,
  isLoading,
  error,
  currency = "USD",
  description,
  action,
  emptyText,
}: MetaPerformanceChartProps) {
  const [viewId, setViewId] = useState<ViewId>("revenue");
  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];
  const gradientPrefix = `perf-${useId().replace(/:/g, "")}`;

  const formatValue = (v: number): string => {
    if (view.unit === "money") return formatCurrency(v, currency);
    if (view.unit === "roas") return formatRoas(v);
    if (view.unit === "percent") return formatPercent(v);
    return formatNumber(v);
  };
  const formatTick = (v: number): string => {
    if (view.unit === "money") return formatCurrencyCompact(v, currency);
    if (view.unit === "roas") return `${v}x`;
    if (view.unit === "percent") return `${v}%`;
    return formatNumber(v);
  };

  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [data]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 space-y-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <LineChart className="size-4 text-muted-foreground" />
              <CardTitle>Performance Over Time</CardTitle>
            </div>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          {action}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={viewId}
          // Radix reports "" when the active item is clicked again — keep it.
          onValueChange={(v) => {
            if (v) setViewId(v as ViewId);
          }}
          aria-label="Metric"
          className="flex-wrap justify-start"
        >
          {VIEWS.map((v) => (
            <ToggleGroupItem key={v.id} value={v.id}>
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full rounded-2xl" />
        ) : error ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center">
            <AlertTriangle className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Couldn&apos;t load the daily breakdown</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error.message}</p>
          </div>
        ) : rows.length < 2 ? (
          <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            {emptyText ?? (rows.length === 0 ? "No data for this period" : "Pick a longer range to see a trend")}
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
            role="img"
            aria-label={`${view.label} per day${description ? `, ${description}` : ""}`}
          >
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {view.series.map((key) => (
                  <linearGradient key={key} id={`${gradientPrefix}-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis tickFormatter={formatTick} tickLine={false} axisLine={false} width={64} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const d = payload?.[0]?.payload as TimeSeriesDataPoint | undefined;
                      return d ? format(parseISO(d.date), "EEEE, MMM d") : null;
                    }}
                    formatter={(value, name) => {
                      const key = name as SeriesKey;
                      return (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
                            style={{ "--color-bg": `var(--color-${key})` } as React.CSSProperties}
                          />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">{chartConfig[key]?.label}</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatValue(Number(value))}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              {view.series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
              {view.series.map((key) => (
                <Area
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  fill={`url(#${gradientPrefix}-${key})`}
                  dot={false}
                  activeDot={{ r: 4, fill: `var(--color-${key})`, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  animationDuration={600}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
});
