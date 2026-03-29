"use client";

import {
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserPlus,
  RefreshCcw,
  TrendingUp,
} from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { cn } from "@/lib/utils";
import type { PayoutSummary, RebillMetrics, ForecastData } from "@/lib/payouts";

export type MetricCardType = "new" | "rebill" | "forecast";

interface PayoutSummaryCardsProps {
  summary: PayoutSummary | undefined;
  isLoading: boolean;
  rebillMetrics?: RebillMetrics;
  forecast?: ForecastData;
  rebillLoading?: boolean;
  onCardClick?: (card: MetricCardType) => void;
}

export function PayoutSummaryCards({
  summary,
  isLoading,
  rebillMetrics,
  forecast,
  rebillLoading,
  onCardClick,
}: PayoutSummaryCardsProps) {
  const baseCards = [
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

  const clickableCards: Array<{
    key: MetricCardType;
    label: string;
    value: string;
    sub: string;
    icon: typeof UserPlus;
    color: string;
  }> = [
    {
      key: "new",
      label: "New Accounts",
      value: rebillMetrics ? formatCents(rebillMetrics.newAccountRevenue) : "$0",
      sub: rebillMetrics
        ? `${rebillMetrics.newAccountCount} account${rebillMetrics.newAccountCount !== 1 ? "s" : ""}`
        : "0 accounts",
      icon: UserPlus,
      color: "text-blue-600 dark:text-blue-400",
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
      color: "text-violet-600 dark:text-violet-400",
    },
    {
      key: "forecast",
      label: "Next Month Forecast",
      value: forecast
        ? formatCents(
            forecast.projectedNewRevenue + forecast.projectedRebillRevenue
          )
        : "$0",
      sub: forecast
        ? `${forecast.projectedNewAccounts} projected new`
        : "No data",
      icon: TrendingUp,
      color: "text-cyan-600 dark:text-cyan-400",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {baseCards.map((card) => (
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {clickableCards.map((card) => (
          <button
            key={card.key}
            onClick={() => onCardClick?.(card.key)}
            className={cn(
              "rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 text-left transition-all",
              "hover:border-primary/30 hover:shadow-sm cursor-pointer"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <card.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">
                {card.label}
              </p>
            </div>
            {rebillLoading ? (
              <div className="h-8 w-24 rounded bg-muted/50 animate-pulse mt-1" />
            ) : (
              <>
                <p className={cn("text-2xl font-bold mt-1", card.color)}>
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {card.sub}
                </p>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
