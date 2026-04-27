"use client";

import { Award, Clock, DollarSign, FileText, Target, Trophy, UserCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import type { DealMetricBucket } from "@/lib/deals";

interface TopPerformer {
  closerId: string;
  displayName: string;
  revenue: number;
  paidRevenue: number;
}

interface OverviewStats {
  lifetime: DealMetricBucket;
  window: DealMetricBucket;
  closeRate: number; // already computed from window
  topPerformer: TopPerformer | null;
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
  iconBg: string;
  iconColor: string;
}

/**
 * Two-section team overview: lifetime totals plus a window bucket. Mirrors
 * the per-closer dashboards so admins reading the team page recognize the
 * same set of metrics. The window section hides when "All time" is the
 * active selection (lifetime == window).
 */
export function CloserOverviewMetrics({ stats, windowLabel, isLifetimeWindow }: CloserOverviewMetricsProps) {
  const lifetimeCards: MetricCard[] = [
    {
      label: "Total closed deals",
      value: String(stats.lifetime.closedCount),
      subtitle: `${formatCents(stats.lifetime.closedRevenue)} closed revenue`,
      icon: Award,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
    },
    {
      label: "Paid revenue",
      value: formatCents(stats.lifetime.paidRevenue),
      subtitle:
        stats.lifetime.outstandingRevenue > 0
          ? `${formatCents(stats.lifetime.outstandingRevenue)} outstanding`
          : "Fully collected",
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      label: "Top performer",
      value: stats.topPerformer?.displayName ?? "No data",
      subtitle: stats.topPerformer
        ? `${formatCents(stats.topPerformer.paidRevenue)} paid`
        : "No deals yet",
      icon: Trophy,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
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
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-500",
    },
  ];

  const windowCards: MetricCard[] = [
    {
      label: "Closed revenue",
      value: formatCents(stats.window.closedRevenue),
      subtitle: `${stats.window.closedCount} deal${stats.window.closedCount === 1 ? "" : "s"} closed`,
      icon: DollarSign,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
    },
    {
      label: "Paid revenue",
      value: formatCents(stats.window.paidRevenue),
      subtitle: "Cash collected",
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      label: "Outstanding",
      value: formatCents(stats.window.outstandingRevenue),
      subtitle: "Closed but unpaid",
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
    },
    {
      label: "Close rate",
      value: `${stats.closeRate}%`,
      // Denominator now includes in-flight (rescheduled/follow_up/not_closed)
      // so the rate matches the conventional "of all opportunities, what %
      // closed" — those deals stay hidden from the queue but the count is
      // aggregated for an honest denominator.
      subtitle: `${stats.window.closedCount} closed of ${stats.window.closedCount + stats.window.pendingCount + stats.window.inFlightCount} opportunities`,
      icon: Target,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Pending pipeline",
      value: formatCents(stats.window.pendingPipeline),
      subtitle: `${stats.window.pendingCount} awaiting signature`,
      icon: FileText,
      iconBg: "bg-pink-500/10",
      iconColor: "text-pink-500",
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
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    card.iconBg
                  )}
                >
                  <Icon className={cn("h-5 w-5", card.iconColor)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <p className="text-lg font-bold text-foreground truncate">{card.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.subtitle}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
