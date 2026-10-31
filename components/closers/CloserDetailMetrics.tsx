"use client";

import { Clock, DollarSign, FileCheck, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
    },
    {
      label: "Paid revenue",
      value: formatCents(lifetime.paidRevenue),
      sub: "Cash collected",
      icon: Wallet,
    },
    {
      label: "Outstanding",
      value: formatCents(lifetime.outstandingRevenue),
      sub: "Closed but unpaid",
      icon: Clock,
    },
    {
      label: "Pending pipeline",
      value: formatCents(lifetime.pendingPipeline),
      sub: `${lifetime.pendingCount} awaiting signature`,
      icon: FileCheck,
    },
    {
      label: "Avg deal value",
      value: formatCents(lifetime.avgClosedValue),
      sub: "Per closed deal",
      icon: DollarSign,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <CardDescription>{card.label}</CardDescription>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-semibold tracking-tight tabular-nums truncate">
                {card.value}
              </div>
              {card.sub && (
                <p className="text-xs text-muted-foreground truncate">{card.sub}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
