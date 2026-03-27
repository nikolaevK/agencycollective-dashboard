"use client";

import { DollarSign, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { cn } from "@/lib/utils";
import type { PayoutSummary } from "@/lib/payouts";

interface PayoutSummaryCardsProps {
  summary: PayoutSummary | undefined;
  isLoading: boolean;
}

export function PayoutSummaryCards({
  summary,
  isLoading,
}: PayoutSummaryCardsProps) {
  const cards = [
    {
      label: "Total Due",
      value: summary ? formatCents(summary.totalDue) : "$0",
      icon: DollarSign,
      color: "text-foreground",
    },
    {
      label: "Total Paid",
      value: summary ? formatCents(summary.totalRevenue) : "$0",
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Unpaid Amount",
      value: summary ? formatCents(summary.unpaidAmount) : "$0",
      icon: AlertCircle,
      color: "text-red-600 dark:text-red-400",
    },
    {
      label: "Undistributed",
      value: summary ? formatCents(summary.undistributedAmount) : "$0",
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <card.icon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              {card.label}
            </p>
          </div>
          {isLoading ? (
            <div className="h-8 w-24 rounded bg-muted/50 animate-pulse mt-1" />
          ) : (
            <p className={cn("text-2xl font-bold mt-1", card.color)}>
              {card.value}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
