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
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
      color: "text-muted-foreground",
    },
    {
      label: "Total Paid",
      value: summary ? formatCents(summary.totalRevenue) : "$0",
      icon: CheckCircle2,
      color: "text-emerald-500",
    },
    {
      label: "Unpaid Amount",
      value: summary ? formatCents(summary.unpaidAmount) : "$0",
      icon: AlertCircle,
      color: "text-red-500",
    },
    {
      label: "Undistributed",
      value: summary ? formatCents(summary.undistributedAmount) : "$0",
      icon: Clock,
      color: "text-amber-500",
    },
  ];

  const clickableCards: Array<{
    key: MetricCardType;
    label: string;
    value: string;
    sub: string;
    icon: typeof UserPlus;
  }> = [
    {
      key: "new",
      label: "New Accounts",
      value: rebillMetrics ? formatCents(rebillMetrics.newAccountRevenue) : "$0",
      sub: rebillMetrics
        ? `${rebillMetrics.newAccountCount} account${rebillMetrics.newAccountCount !== 1 ? "s" : ""}`
        : "0 accounts",
      icon: UserPlus,
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
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {baseCards.map((card) => (
          <Card key={card.label} className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <CardDescription className="truncate">{card.label}</CardDescription>
              <card.icon className={cn("size-4 shrink-0", card.color)} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums break-words">
                  {card.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {clickableCards.map((card) => (
          <button
            key={card.key}
            onClick={() => onCardClick?.(card.key)}
            className="group min-w-0 rounded-[min(calc(var(--radius)*2.6),24px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
                <CardDescription className="truncate">{card.label}</CardDescription>
                <card.icon className="size-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                {rebillLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums break-words">
                      {card.value}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {card.sub}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
