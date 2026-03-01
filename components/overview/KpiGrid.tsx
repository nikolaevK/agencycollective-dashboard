"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatRoas,
  formatDelta,
  isDeltaPositive,
} from "@/lib/utils";
import type { InsightMetrics, InsightDelta } from "@/types/dashboard";
import { cn } from "@/lib/utils";

interface KpiCardData {
  label: string;
  metricKey: keyof InsightMetrics;
  formatter: (v: number) => string;
  deltaKey?: keyof InsightDelta;
  primary?: boolean;
}

const KPI_CARDS: KpiCardData[] = [
  // Primary metrics — highlighted
  { label: "Amount Spent",     metricKey: "spend",           formatter: formatCurrency, deltaKey: "spend",           primary: true },
  { label: "ROAS",             metricKey: "roas",            formatter: formatRoas,     deltaKey: "roas",            primary: true },
  { label: "Purchases",        metricKey: "conversions",     formatter: formatNumber,   deltaKey: "conversions",     primary: true },
  { label: "Purchase Value",   metricKey: "conversionValue", formatter: formatCurrency, deltaKey: "conversionValue", primary: true },
  { label: "Cost / Purchase",  metricKey: "costPerPurchase", formatter: formatCurrency, deltaKey: "costPerPurchase", primary: true },
  // Secondary metrics
  { label: "Impressions", metricKey: "impressions", formatter: formatNumber, deltaKey: "impressions" },
  { label: "Reach",       metricKey: "reach",       formatter: formatNumber, deltaKey: "reach" },
  { label: "CTR",         metricKey: "ctr",         formatter: formatPercent, deltaKey: "ctr" },
  { label: "CPC",         metricKey: "cpc",         formatter: formatCurrency, deltaKey: "cpc" },
];

interface KpiGridProps {
  metrics?: InsightMetrics;
  delta?: InsightDelta;
  isLoading?: boolean;
  currency?: string;
}

export function KpiGrid({ metrics, delta, isLoading, currency = "USD" }: KpiGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-primary/20 bg-primary/5">
              <CardContent className="p-3 md:p-4">
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-7 w-24 mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3 md:p-4">
                <Skeleton className="h-3 w-16 mb-3" />
                <Skeleton className="h-6 w-20 mb-2" />
                <Skeleton className="h-3 w-14" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const primaryCards = KPI_CARDS.filter((c) => c.primary);
  const secondaryCards = KPI_CARDS.filter((c) => !c.primary);

  function renderCard(card: KpiCardData) {
    const value = metrics![card.metricKey] as number;
    const deltaValue = card.deltaKey && delta ? delta[card.deltaKey] : null;
    const positive = isDeltaPositive(card.metricKey, deltaValue);

    const needsCurrency =
      card.metricKey === "spend" ||
      card.metricKey === "cpc" ||
      card.metricKey === "conversionValue" ||
      card.metricKey === "costPerPurchase";

    const formattedValue = needsCurrency
      ? formatCurrency(value, currency)
      : card.formatter(value);

    return (
      <Card
        key={card.label}
        className={cn(card.primary && "border-primary/25 bg-primary/[0.04] dark:bg-primary/[0.08]")}
      >
        <CardContent className="p-3 md:p-4">
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wide mb-1",
              card.primary ? "text-primary/70" : "text-muted-foreground"
            )}
          >
            {card.label}
          </p>
          <p
            className={cn(
              "font-bold tracking-tight",
              card.primary ? "text-xl md:text-2xl" : "text-lg md:text-xl"
            )}
          >
            {formattedValue}
          </p>
          {deltaValue !== null && (
            <div
              className={cn(
                "flex items-center gap-1 mt-1 text-xs font-medium",
                positive === true && "text-green-600 dark:text-green-500",
                positive === false && "text-red-500",
                positive === null && "text-muted-foreground"
              )}
            >
              {positive === true && <TrendingUp className="h-3 w-3" />}
              {positive === false && <TrendingDown className="h-3 w-3" />}
              {positive === null && <Minus className="h-3 w-3" />}
              <span>{formatDelta(deltaValue)} vs prev</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Primary metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {primaryCards.map(renderCard)}
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {secondaryCards.map(renderCard)}
      </div>
    </div>
  );
}
