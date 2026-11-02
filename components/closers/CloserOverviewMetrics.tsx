"use client";

import { Award, Clock, DollarSign, FileText, Target, Trophy, UserCheck, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { formatCents } from "@/components/closers/types";
import { MetricSparkline } from "@/components/shared/MetricSparkline";
import { windowTrend } from "@/components/shared/windowTrend";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { computeCloseRate } from "@/lib/closeRate";
import type { DealMetricBucket } from "@/lib/deals";
import {
  ratePct,
  runningTotal,
  type OverviewTrends,
  type SeriesBucket,
} from "@/lib/metricSeries";

interface TopPerformer {
  closerId: string;
  displayName: string;
  revenue: number;
  paidRevenue: number;
}

interface OverviewStats {
  lifetime: DealMetricBucket;
  window: DealMetricBucket;
  /** Same-length period before the window — powers the Δ chips. */
  previous?: DealMetricBucket | null;
  closeRate: number; // already computed from window
  topPerformer: TopPerformer | null;
  /** Card trend lines (requested with `trends=1`). */
  trends?: OverviewTrends | null;
}

interface CloserOverviewMetricsProps {
  stats: OverviewStats;
  windowLabel: string;
  isLifetimeWindow: boolean;
}

interface MetricCard {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  delta?: React.ReactNode;
  trend?: CardTrend;
}

type CardTrend = Omit<React.ComponentProps<typeof MetricSparkline>, "label">;

// Theme chart pair (globals.css), same mapping as the Revenue Trend chart.
const CLOSED_COLOR = "hsl(var(--chart-1))";
const PAID_COLOR = "hsl(var(--chart-2))";
const asCount = (v: number) => String(v);
const asPct = (v: number) => `${v}%`;

function bucketCloseRate(b: DealMetricBucket): number {
  return computeCloseRate(b.closedCount, b.pendingCount, b.inFlightCount);
}

/** Lifetime cards: one value per month over the last 12 months. */
function monthlyTrend(
  buckets: SeriesBucket[] | null | undefined,
  pick: (b: SeriesBucket) => number | null,
  color: string,
  fmt: (v: number) => string
): CardTrend | undefined {
  if (!buckets || buckets.length < 2) return undefined;
  return {
    points: buckets.map((b) => ({ label: format(parseISO(b.start), "MMM yyyy"), value: pick(b) })),
    color,
    format: fmt,
    caption: "Last 12 months",
    hint: "Per month",
  };
}

function runningCloseRate(buckets: SeriesBucket[]): (number | null)[] {
  const closed = runningTotal(buckets, (b) => b.closedCount);
  const opportunities = runningTotal(buckets, (b) => b.closedCount + b.pendingCount + b.inFlightCount);
  return closed.map((c, i) => ratePct(c, opportunities[i]));
}

/**
 * Two-section team overview: lifetime totals plus a window bucket. Mirrors
 * the per-closer dashboards so admins reading the team page recognize the
 * same set of metrics. The window section hides when "All time" is the
 * active selection (lifetime == window).
 */
export function CloserOverviewMetrics({ stats, windowLabel, isLifetimeWindow }: CloserOverviewMetricsProps) {
  const months = stats.trends?.lifetime.buckets;
  const win = stats.trends?.window;
  const lifetimeCards: MetricCard[] = [
    {
      label: "Total closed deals",
      value: String(stats.lifetime.closedCount),
      subtitle: `${formatCents(stats.lifetime.closedRevenue)} closed revenue`,
      icon: Award,
      trend: monthlyTrend(months, (b) => b.closedCount, CLOSED_COLOR, asCount),
    },
    {
      label: "Paid revenue",
      value: formatCents(stats.lifetime.paidRevenue),
      subtitle:
        stats.lifetime.outstandingRevenue > 0
          ? `${formatCents(stats.lifetime.outstandingRevenue)} outstanding`
          : "Fully collected",
      icon: Wallet,
      trend: monthlyTrend(months, (b) => b.paidRevenue, PAID_COLOR, formatCents),
    },
    {
      label: "Top performer",
      value: stats.topPerformer?.displayName ?? "No data",
      subtitle: stats.topPerformer
        ? `${formatCents(stats.topPerformer.paidRevenue)} paid`
        : "No deals yet",
      icon: Trophy,
      trend: monthlyTrend(stats.trends?.lifetime.topPerformer, (b) => b.paidRevenue, PAID_COLOR, formatCents),
    },
    {
      label: "Show rate",
      value: `${stats.lifetime.showRate}%`,
      subtitle: (() => {
        const total = stats.lifetime.showCount + stats.lifetime.noShowCount;
        return total > 0
          ? `${stats.lifetime.showCount} showed · ${stats.lifetime.noShowCount} no-show`
          : "No data yet";
      })(),
      icon: UserCheck,
      trend: monthlyTrend(
        months,
        (b) => ratePct(b.showCount, b.showCount + b.noShowCount),
        CLOSED_COLOR,
        asPct
      ),
    },
  ];

  const previous = stats.previous ?? null;
  const windowCards: MetricCard[] = [
    {
      label: "Closed revenue",
      value: formatCents(stats.window.closedRevenue),
      subtitle: `${stats.window.closedCount} deal${stats.window.closedCount === 1 ? "" : "s"} closed`,
      icon: DollarSign,
      trend: windowTrend(win, (bs) => runningTotal(bs, (b) => b.closedRevenue), CLOSED_COLOR, formatCents),
      delta: (
        <TrendDelta
          current={stats.window.closedRevenue}
          previous={previous?.closedRevenue}
        />
      ),
    },
    {
      label: "Paid revenue",
      value: formatCents(stats.window.paidRevenue),
      subtitle: "Cash collected",
      icon: Wallet,
      trend: windowTrend(win, (bs) => runningTotal(bs, (b) => b.paidRevenue), PAID_COLOR, formatCents),
      delta: (
        <TrendDelta current={stats.window.paidRevenue} previous={previous?.paidRevenue} />
      ),
    },
    {
      label: "Outstanding",
      value: formatCents(stats.window.outstandingRevenue),
      subtitle: "Closed but unpaid",
      icon: Clock,
      trend: windowTrend(win, (bs) => runningTotal(bs, (b) => b.outstandingRevenue), CLOSED_COLOR, formatCents),
      delta: (
        <TrendDelta
          current={stats.window.outstandingRevenue}
          previous={previous?.outstandingRevenue}
          lowerIsBetter
        />
      ),
    },
    {
      label: "Close rate",
      value: `${stats.closeRate}%`,
      delta: previous ? (
        <TrendDelta current={stats.closeRate} previous={bucketCloseRate(previous)} mode="pp" />
      ) : undefined,
      // Denominator now includes in-flight (rescheduled/follow_up/not_closed)
      // so the rate matches the conventional "of all opportunities, what %
      // closed" — those deals stay hidden from the queue but the count is
      // aggregated for an honest denominator.
      subtitle: `${stats.window.closedCount} closed of ${stats.window.closedCount + stats.window.pendingCount + stats.window.inFlightCount} opportunities`,
      icon: Target,
      trend: windowTrend(win, runningCloseRate, CLOSED_COLOR, asPct),
    },
    {
      label: "Pending pipeline",
      value: formatCents(stats.window.pendingPipeline),
      subtitle: `${stats.window.pendingCount} awaiting signature`,
      icon: FileText,
      trend: windowTrend(win, (bs) => runningTotal(bs, (b) => b.pendingPipeline), CLOSED_COLOR, formatCents),
    },
  ];

  return (
    <div className="space-y-6">
      <Section title="Lifetime" subtitle="Team totals" cards={lifetimeCards} />
      {!isLifetimeWindow && (
        <Section title={windowLabel} subtitle="Selected time frame" cards={windowCards} />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle: string;
  cards: MetricCard[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
                <CardDescription>{card.label}</CardDescription>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-2xl font-semibold tracking-tight tabular-nums truncate">
                    {card.value}
                  </div>
                  {card.delta}
                </div>
                <p className="text-xs text-muted-foreground truncate">{card.subtitle}</p>
                {card.trend && <MetricSparkline label={card.label} {...card.trend} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
