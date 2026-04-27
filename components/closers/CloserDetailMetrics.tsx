"use client";

import { Clock, DollarSign, FileCheck, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import type { CloserDealStats } from "@/lib/deals";

interface CloserDetailMetricsProps {
  stats: CloserDealStats;
}

interface MetricCard {
  label: string;
  value: string;
  sub: string | null;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

/**
 * Lifetime drill-down summary for the admin closer-detail page. Shows
 * career numbers — for time-frame slicing, admin uses "View their
 * dashboard" which mounts the full dashboard with a selector.
 */
export function CloserDetailMetrics({ stats }: CloserDetailMetricsProps) {
  const { lifetime } = stats;
  const cards: MetricCard[] = [
    {
      label: "Closed revenue",
      value: formatCents(lifetime.closedRevenue),
      sub: `${lifetime.closedCount} closed deal${lifetime.closedCount === 1 ? "" : "s"}`,
      icon: TrendingUp,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
    },
    {
      label: "Paid revenue",
      value: formatCents(lifetime.paidRevenue),
      sub: "Cash collected",
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      label: "Outstanding",
      value: formatCents(lifetime.outstandingRevenue),
      sub: "Closed but unpaid",
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
    },
    {
      label: "Pending pipeline",
      value: formatCents(lifetime.pendingPipeline),
      sub: `${lifetime.pendingCount} awaiting signature`,
      icon: FileCheck,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Avg deal value",
      value: formatCents(lifetime.avgClosedValue),
      sub: "Per closed deal",
      icon: DollarSign,
      iconBg: "bg-pink-500/10",
      iconColor: "text-pink-500",
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
                {card.sub && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{card.sub}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
