"use client";

import { DollarSign, FileCheck, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import type { CloserPublic } from "@/components/closers/types";
import type { CloserDealStats } from "@/lib/deals";

interface CloserDetailMetricsProps {
  stats: CloserDealStats;
  closer: CloserPublic;
}

interface MetricCard {
  label: string;
  value: string;
  delta: string | null;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

export function CloserDetailMetrics({ stats, closer }: CloserDetailMetricsProps) {
  const closeRate =
    stats.dealCount > 0
      ? ((stats.closedCount / stats.dealCount) * 100).toFixed(1)
      : "0";

  const cards: MetricCard[] = [
    {
      label: "Total Revenue",
      value: formatCents(stats.totalRevenue),
      delta: "+12.5%",
      icon: DollarSign,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
    },
    {
      label: "Deals Completed",
      value: String(stats.dealCount),
      delta: null,
      icon: FileCheck,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Close Rate",
      value: `${closeRate}%`,
      delta: null,
      icon: Target,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      label: "Avg Deal Value",
      value: formatCents(stats.avgDealValue),
      delta: null,
      icon: TrendingUp,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
    },
  ];

  return (
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
                <p className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-foreground truncate">
                    {card.value}
                  </p>
                  {card.delta && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                      {card.delta}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
