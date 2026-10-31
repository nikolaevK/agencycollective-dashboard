"use client";

import {
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Clock,
  Percent,
  UserPlus,
  RefreshCcw,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";
import { format } from "date-fns";
import { formatCents } from "@/components/closers/types";
import { MetricSparkline } from "@/components/shared/MetricSparkline";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ratePct } from "@/lib/metricSeries";
import { cn } from "@/lib/utils";
import type {
  PayoutSummary,
  RebillMetrics,
  ForecastData,
  PayoutMonthPoint,
  PayoutTrends,
} from "@/lib/payouts";

export type MetricCardType = "new" | "rebill" | "forecast";

type CardTrend = Omit<React.ComponentProps<typeof MetricSparkline>, "label">;

// Same colors as the Insights revenue mix: new = chart-1, rebill = chart-4;
// paid / collected = chart-2 (as on the Closers overview).
const BLUE = "hsl(var(--chart-1))";
const GREEN = "hsl(var(--chart-2))";
const MAGENTA = "hsl(var(--chart-4))";
const asPct = (v: number) => `${v}%`;
const collectionRate = (m: PayoutMonthPoint) => ratePct(m.totalPaid, m.totalDue);

interface PayoutSummaryCardsProps {
  summary: PayoutSummary | undefined;
  isLoading: boolean;
  rebillMetrics?: RebillMetrics;
  forecast?: ForecastData;
  rebillLoading?: boolean;
  /** 12 months ending with the selected month — card trend lines + Δ. */
  trends?: PayoutTrends;
  /** The selected month's name ("October") — what the forecast is for. */
  monthName: string;
  onCardClick?: (card: MetricCardType) => void;
}

export function PayoutSummaryCards({
  summary,
  isLoading,
  rebillMetrics,
  forecast,
  rebillLoading,
  trends,
  monthName,
  onCardClick,
}: PayoutSummaryCardsProps) {
  const months = trends?.months ?? [];
  const current = months[months.length - 1];
  const previous = months[months.length - 2];

  // Built per data change, not per render: the page re-renders on every
  // search keystroke, and the (memoized) sparklines compare these objects.
  // One value per month; the line ends at the selected month (the card's
  // number). Before the first load an empty line reserves the space.
  const cardTrends = useMemo(() => {
    const ms = trends?.months;
    const make = (
      pick: (m: PayoutMonthPoint) => number | null,
      color: string,
      fmt: (v: number) => string,
      reference?: CardTrend["reference"]
    ): CardTrend => ({
      points: (ms ?? []).map((m) => ({
        label: format(new Date(m.year, m.month - 1, 1), "MMM yyyy"),
        value: pick(m),
      })),
      color,
      format: fmt,
      caption: "Last 12 months",
      hint: "Per month",
      reference,
    });
    return {
      totalDue: make((m) => m.totalDue, BLUE, formatCents),
      totalPaid: make((m) => m.totalPaid, GREEN, formatCents),
      unpaid: make((m) => m.unpaidAmount, BLUE, formatCents),
      undistributed: make((m) => m.undistributedAmount, BLUE, formatCents),
      collection: make(collectionRate, GREEN, asPct),
      newAccounts: make((m) => m.newAccountRevenue, BLUE, formatCents),
      rebill: make((m) => m.rebillAccountRevenue, MAGENTA, formatCents),
      // What actually came in each month (new + rebill), against the forecast.
      forecast: make(
        (m) => m.newAccountRevenue + m.rebillAccountRevenue,
        BLUE,
        formatCents,
        forecast
          ? { value: forecast.projectedNewRevenue + forecast.projectedRebillRevenue, label: "Forecast" }
          : undefined
      ),
    };
  }, [trends, forecast]);
  const delta = (
    pick: (m: PayoutMonthPoint) => number | null,
    opts: { lowerIsBetter?: boolean; mode?: "percent" | "pp" } = {}
  ) => {
    const cur = current ? pick(current) : null;
    const prev = previous ? pick(previous) : null;
    if (cur == null || prev == null) return null;
    // A % change across a negative value (an overpaid month's Unpaid) is meaningless.
    if (opts.mode !== "pp" && (cur < 0 || prev < 0)) return null;
    return <TrendDelta current={cur} previous={prev} {...opts} />;
  };

  const rate = summary ? ratePct(summary.totalRevenue, summary.totalDue) : null;
  const baseCards = [
    {
      label: "Total Due",
      value: summary ? formatCents(summary.totalDue) : "$0",
      icon: DollarSign,
      color: "text-muted-foreground",
      delta: delta((m) => m.totalDue),
      trend: cardTrends.totalDue,
    },
    {
      label: "Total Paid",
      value: summary ? formatCents(summary.totalRevenue) : "$0",
      icon: CheckCircle2,
      color: "text-emerald-500",
      delta: delta((m) => m.totalPaid),
      trend: cardTrends.totalPaid,
    },
    {
      label: "Unpaid Amount",
      value: summary ? formatCents(summary.unpaidAmount) : "$0",
      icon: AlertCircle,
      color: "text-red-500",
      delta: delta((m) => m.unpaidAmount, { lowerIsBetter: true }),
      trend: cardTrends.unpaid,
    },
    {
      label: "Undistributed",
      value: summary ? formatCents(summary.undistributedAmount) : "$0",
      icon: Clock,
      color: "text-amber-500",
      delta: delta((m) => m.undistributedAmount, { lowerIsBetter: true }),
      trend: cardTrends.undistributed,
    },
    {
      label: "Collection Rate",
      value: rate == null ? "—" : asPct(rate),
      icon: Percent,
      color: "text-emerald-500",
      delta: delta(collectionRate, { mode: "pp" }),
      trend: cardTrends.collection,
    },
  ];

  const clickableCards: Array<{
    key: MetricCardType;
    label: string;
    value: string;
    sub: string;
    icon: typeof UserPlus;
    delta?: React.ReactNode;
    trend?: CardTrend;
  }> = [
    {
      key: "new",
      label: "New Accounts",
      value: rebillMetrics ? formatCents(rebillMetrics.newAccountRevenue) : "$0",
      sub: rebillMetrics
        ? `${rebillMetrics.newAccountCount} account${rebillMetrics.newAccountCount !== 1 ? "s" : ""}`
        : "0 accounts",
      icon: UserPlus,
      delta: delta((m) => m.newAccountRevenue),
      trend: cardTrends.newAccounts,
    },
    {
      key: "rebill",
      label: "Rebilled Accounts",
      value: rebillMetrics
        ? formatCents(rebillMetrics.rebillAccountRevenue)
        : "$0",
      sub: rebillMetrics
        ? `${rebillMetrics.rebillAccountCount} account${rebillMetrics.rebillAccountCount !== 1 ? "s" : ""}`
        : "0 accounts",
      icon: RefreshCcw,
      delta: delta((m) => m.rebillAccountRevenue),
      trend: cardTrends.rebill,
    },
    {
      key: "forecast",
      // getPayoutForecast projects the SELECTED month from the 6 before it.
      label: `${monthName} Forecast`,
      value: forecast
        ? formatCents(
            forecast.projectedNewRevenue + forecast.projectedRebillRevenue
          )
        : "$0",
      sub: forecast
        ? `${forecast.projectedNewAccounts} projected new`
        : "No data",
      icon: TrendingUp,
      trend: cardTrends.forecast,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {baseCards.map((card, i) => (
          <Card
            key={card.label}
            className={cn("flex min-w-0 flex-col", i === baseCards.length - 1 && "col-span-2 lg:col-span-1")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <CardDescription className="truncate">{card.label}</CardDescription>
              <card.icon className={cn("size-4 shrink-0", card.color)} />
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="min-w-0 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums break-words">
                    {card.value}
                  </div>
                  {card.delta}
                </div>
              )}
              {card.trend && <MetricSparkline label={card.label} {...card.trend} />}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {clickableCards.map((card, i) => (
          <button
            key={card.key}
            onClick={() => onCardClick?.(card.key)}
            className={cn(
              "group min-w-0 rounded-[min(calc(var(--radius)*2.6),24px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
              i === clickableCards.length - 1 && "col-span-2 lg:col-span-1"
            )}
          >
            <Card className="flex h-full flex-col transition-colors group-hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
                <CardDescription className="truncate">{card.label}</CardDescription>
                <card.icon className="size-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-1">
                {rebillLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="min-w-0 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums break-words">
                        {card.value}
                      </div>
                      {card.delta}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {card.sub}
                    </p>
                  </>
                )}
                {card.trend && <MetricSparkline label={card.label} {...card.trend} />}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
