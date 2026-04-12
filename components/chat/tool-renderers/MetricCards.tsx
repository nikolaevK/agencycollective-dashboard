"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DisplayMetricsInput, MetricItem } from "@/types/chat";

const COLOR_MAP: Record<string, string> = {
  green:  "text-green-600 dark:text-green-400",
  red:    "text-red-600 dark:text-red-400",
  blue:   "text-blue-600 dark:text-blue-400",
  purple: "text-primary",
  amber:  "text-amber-600 dark:text-amber-400",
};

const TREND_BG: Record<string, string> = {
  up:      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  down:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

function TrendIcon({ trend }: { trend: MetricItem["trend"] }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function MetricCards({ input }: { input: DisplayMetricsInput }) {
  const { metrics } = input;
  if (!metrics || metrics.length === 0) return null;

  return (
    <div data-print-metrics="" className={cn(
      "grid gap-3 my-3 grid-cols-2",
      metrics.length === 2 && "md:grid-cols-2",
      metrics.length === 3 && "md:grid-cols-3",
      metrics.length >= 4 && "md:grid-cols-3 lg:grid-cols-4",
    )}>
      {metrics.map((metric, i) => (
        <div
          key={i}
          className="p-3 md:p-4 bg-muted/30 rounded-xl border border-border/50"
        >
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
            {metric.label}
          </p>
          <p className={cn(
            "text-lg md:text-xl font-bold",
            metric.color ? COLOR_MAP[metric.color] ?? "text-foreground" : "text-foreground"
          )}>
            {metric.value}
          </p>
          {(metric.trend || metric.subtitle) && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {metric.trend && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  TREND_BG[metric.trend ?? "neutral"]
                )}>
                  <TrendIcon trend={metric.trend} />
                </span>
              )}
              {metric.subtitle && (
                <span className="text-[10px] text-muted-foreground">
                  {metric.subtitle}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
