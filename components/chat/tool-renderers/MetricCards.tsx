"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DisplayMetricsInput, MetricItem } from "@/types/chat";

/** The model's emphasis color → a kit tone (purple is the legacy "brand" accent → neutral). */
const COLOR_TONE: Record<string, BadgeTone> = {
  green: "success",
  red: "danger",
  amber: "warning",
  blue: "info",
  purple: "neutral",
};

const TONE_TEXT: Record<BadgeTone, string> = {
  neutral: "text-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-red-700 dark:text-red-300",
  info: "text-sky-700 dark:text-sky-300",
};

/** Direction tone: an emphasis color wins (a rising CPA is bad); otherwise up = good, down = bad. */
function trendTone(metric: MetricItem): BadgeTone {
  const color = metric.color ? COLOR_TONE[metric.color] : undefined;
  if (color && color !== "neutral" && color !== "info") return color;
  if (metric.trend === "up") return "success";
  if (metric.trend === "down") return "danger";
  return "neutral";
}

function TrendIcon({ trend }: { trend: MetricItem["trend"] }) {
  if (trend === "up") return <TrendingUp />;
  if (trend === "down") return <TrendingDown />;
  return <Minus />;
}

export function MetricCards({ input }: { input: DisplayMetricsInput }) {
  const { metrics } = input;
  if (!metrics || metrics.length === 0) return null;

  return (
    <div
      data-print-metrics=""
      className={cn(
        "grid grid-cols-2 gap-3",
        metrics.length === 3 && "md:grid-cols-3",
        metrics.length >= 4 && "md:grid-cols-3 xl:grid-cols-4"
      )}
    >
      {metrics.map((metric, i) => {
        const valueTone = metric.color ? COLOR_TONE[metric.color] ?? "neutral" : "neutral";
        return (
          <Card key={i} className="min-w-0 p-4 shadow-none">
            <p className="truncate text-xs text-muted-foreground" title={metric.label}>
              {metric.label}
            </p>
            <p
              className={cn("mt-1 truncate text-xl font-semibold tracking-tight tabular-nums", TONE_TEXT[valueTone])}
              title={metric.value}
            >
              {metric.value}
            </p>
            {(metric.trend || metric.subtitle) && (
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                {metric.trend && (
                  <Badge variant="outline" tone={trendTone(metric)} className="px-1.5" aria-label={`Trend ${metric.trend}`}>
                    <TrendIcon trend={metric.trend} />
                  </Badge>
                )}
                {metric.subtitle && <span className="line-clamp-2 text-xs text-muted-foreground">{metric.subtitle}</span>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
