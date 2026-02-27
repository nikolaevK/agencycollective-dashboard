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
}

const KPI_CARDS: KpiCardData[] = [
  { label: "Spend", metricKey: "spend", formatter: formatCurrency, deltaKey: "spend" },
  { label: "Impressions", metricKey: "impressions", formatter: formatNumber, deltaKey: "impressions" },
  { label: "Reach", metricKey: "reach", formatter: formatNumber, deltaKey: "reach" },
  { label: "CTR", metricKey: "ctr", formatter: (v) => formatPercent(v), deltaKey: "ctr" },
  { label: "CPC", metricKey: "cpc", formatter: formatCurrency, deltaKey: "cpc" },
  { label: "ROAS", metricKey: "roas", formatter: formatRoas, deltaKey: "roas" },
  { label: "Purchases", metricKey: "conversions", formatter: formatNumber, deltaKey: "conversions" },
  { label: "Purchase Value", metricKey: "conversionValue", formatter: formatCurrency, deltaKey: "conversionValue" },
  { label: "Cost / Purchase", metricKey: "costPerPurchase", formatter: formatCurrency, deltaKey: "costPerPurchase" },
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {KPI_CARDS.map((card) => {
        const value = metrics[card.metricKey] as number;
        const deltaValue = card.deltaKey && delta ? delta[card.deltaKey] : null;
        const positive = isDeltaPositive(card.metricKey, deltaValue);

        const formattedValue =
          card.metricKey === "spend" || card.metricKey === "cpc"
            ? formatCurrency(value, currency)
            : card.formatter(value);

        return (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {card.label}
              </p>
              <p className="text-2xl font-bold tracking-tight">{formattedValue}</p>
              {deltaValue !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 mt-1 text-xs font-medium",
                    positive === true && "text-green-600",
                    positive === false && "text-red-600",
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
      })}
    </div>
  );
}
