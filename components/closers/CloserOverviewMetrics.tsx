"use client";

import { DollarSign, Target, Trophy, FileText, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";

interface TopPerformer {
  closerId: string;
  displayName: string;
  revenue: number;
}

interface OverviewStats {
  totalRevenue: number;
  totalDeals: number;
  closedDeals: number;
  closeRate: number;
  showRate?: number;
  showCount?: number;
  noShowCount?: number;
  topPerformer: TopPerformer | null;
}

interface CloserOverviewMetricsProps {
  stats: OverviewStats;
}

interface MetricCard {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

export function CloserOverviewMetrics({ stats }: CloserOverviewMetricsProps) {
  const cards: MetricCard[] = [
    {
      label: "Total Sales",
      value: formatCents(stats.totalRevenue),
      subtitle: "Closed revenue",
      icon: DollarSign,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
    },
    {
      label: "Close Rate",
      value: `${stats.closeRate}%`,
      subtitle: `${stats.closedDeals} of ${stats.totalDeals} deals`,
      icon: Target,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Top Performer",
      value: stats.topPerformer?.displayName ?? "No data",
      subtitle: stats.topPerformer
        ? formatCents(stats.topPerformer.revenue)
        : "No deals yet",
      icon: Trophy,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
    },
    {
      label: "Show Rate",
      value: `${stats.showRate ?? 0}%`,
      subtitle: (() => {
        const total = (stats.showCount ?? 0) + (stats.noShowCount ?? 0);
        return total > 0 ? `${stats.showCount} showed / ${stats.noShowCount} no-show` : "No data yet";
      })(),
      icon: UserCheck,
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-500",
    },
    {
      label: "Total Deals",
      value: String(stats.totalDeals),
      subtitle: `${stats.closedDeals} closed`,
      icon: FileText,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                <p className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </p>
                <p className="text-lg font-bold text-foreground truncate">
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {card.subtitle}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
