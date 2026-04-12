"use client";

import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Target,
  ShoppingCart,
  Banknote,
  Tag,
  Eye,
  Users,
  MousePointerClick,
  CreditCard,
  Repeat,
  Info,
  Instagram,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  formatNumber,
  formatRoas,
  formatDelta,
  isDeltaPositive,
} from "@/lib/utils";
import type { InsightMetrics, InsightDelta } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardData {
  label: string;
  metricKey: keyof InsightMetrics;
  formatter: (v: number) => string;
  deltaKey?: keyof InsightDelta;
  primary?: boolean;
  icon: LucideIcon;
  iconBg: string;
  iconHoverBg: string;
  iconColor: string;
  tooltip?: string;
  showWhenZero?: boolean; // defaults to true; set false to hide card when metric is 0
}

const KPI_CARDS: KpiCardData[] = [
  {
    label: "Amount Spent",
    metricKey: "spend",
    formatter: formatCurrency,
    deltaKey: "spend",
    primary: true,
    icon: DollarSign,
    iconBg: "bg-violet-50 dark:bg-violet-500/15",
    iconHoverBg: "group-hover:bg-violet-100 dark:group-hover:bg-violet-500/25",
    iconColor: "text-primary",
    tooltip: "Total ad spend for the selected period. Compare against revenue to assess overall efficiency.",
  },
  {
    label: "Overall ROAS",
    metricKey: "roas",
    formatter: formatRoas,
    deltaKey: "roas",
    primary: true,
    icon: Target,
    iconBg: "bg-blue-50 dark:bg-blue-500/15",
    iconHoverBg: "group-hover:bg-blue-100 dark:group-hover:bg-blue-500/25",
    iconColor: "text-blue-600 dark:text-blue-400",
    tooltip: "Return on Ad Spend — revenue generated per dollar spent. Benchmark: <1x Poor · 2–4x Avg · >8x Excellent.",
  },
  {
    label: "Purchases",
    metricKey: "conversions",
    formatter: formatNumber,
    deltaKey: "conversions",
    primary: true,
    icon: ShoppingCart,
    iconBg: "bg-amber-50 dark:bg-amber-500/15",
    iconHoverBg: "group-hover:bg-amber-100 dark:group-hover:bg-amber-500/25",
    iconColor: "text-amber-600 dark:text-amber-400",
    tooltip: "Total purchase conversions attributed to ads via Meta Pixel. Includes only fb_pixel_purchase events.",
  },
  {
    label: "Purchase Value",
    metricKey: "conversionValue",
    formatter: formatCurrency,
    deltaKey: "conversionValue",
    primary: true,
    icon: Banknote,
    iconBg: "bg-emerald-50 dark:bg-emerald-500/15",
    iconHoverBg: "group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/25",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    tooltip: "Total revenue from ad-attributed purchases. Used to calculate ROAS (Purchase Value ÷ Spend).",
  },
  {
    label: "Cost / Purchase",
    metricKey: "costPerPurchase",
    formatter: formatCurrency,
    deltaKey: "costPerPurchase",
    primary: true,
    icon: Tag,
    iconBg: "bg-rose-50 dark:bg-rose-500/15",
    iconHoverBg: "group-hover:bg-rose-100 dark:group-hover:bg-rose-500/25",
    iconColor: "text-rose-600 dark:text-rose-400",
    tooltip: "Average cost to acquire one purchase (Spend ÷ Purchases). Benchmark: >$80 Poor · $25–50 Avg · <$10 Excellent.",
  },
  // Secondary metrics
  {
    label: "Impressions",
    metricKey: "impressions",
    formatter: formatNumber,
    deltaKey: "impressions",
    icon: Eye,
    iconBg: "bg-blue-50 dark:bg-blue-500/15",
    iconHoverBg: "group-hover:bg-blue-100 dark:group-hover:bg-blue-500/25",
    iconColor: "text-blue-600 dark:text-blue-400",
    tooltip: "Total number of times your ads were shown. One person may see your ad multiple times (see Frequency).",
  },
  {
    label: "Reach",
    metricKey: "reach",
    formatter: formatNumber,
    deltaKey: "reach",
    icon: Users,
    iconBg: "bg-indigo-50 dark:bg-indigo-500/15",
    iconHoverBg: "group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/25",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    tooltip: "Number of unique people who saw your ads at least once. Reach = Impressions ÷ Frequency.",
  },
  {
    label: "CTR",
    metricKey: "ctr",
    formatter: formatPercent,
    deltaKey: "ctr",
    icon: MousePointerClick,
    iconBg: "bg-teal-50 dark:bg-teal-500/15",
    iconHoverBg: "group-hover:bg-teal-100 dark:group-hover:bg-teal-500/25",
    iconColor: "text-teal-600 dark:text-teal-400",
    tooltip: "Click-Through Rate — percentage of impressions that resulted in a click. Benchmark: <0.5% Poor · 0.8–1.2% Avg · >2% Excellent.",
  },
  {
    label: "CPC",
    metricKey: "cpc",
    formatter: formatCurrency,
    deltaKey: "cpc",
    icon: CreditCard,
    iconBg: "bg-orange-50 dark:bg-orange-500/15",
    iconHoverBg: "group-hover:bg-orange-100 dark:group-hover:bg-orange-500/25",
    iconColor: "text-orange-600 dark:text-orange-400",
    tooltip: "Cost Per Click — average cost for each link click. Benchmark: >$3 Poor · $1–2 Avg · <$0.50 Excellent.",
  },
  {
    label: "Frequency",
    metricKey: "frequency",
    formatter: (v: number) => v.toFixed(1),
    deltaKey: "frequency",
    icon: Repeat,
    iconBg: "bg-purple-50 dark:bg-purple-500/15",
    iconHoverBg: "group-hover:bg-purple-100 dark:group-hover:bg-purple-500/25",
    iconColor: "text-purple-600 dark:text-purple-400",
    tooltip: "Average times each person saw your ad. High frequency signals creative fatigue. Benchmark: >5 Poor · 2–3 Avg · 1–1.5 Excellent. Over 3 = consider refreshing creative.",
  },
  {
    label: "IG Profile Visits",
    metricKey: "instagramProfileVisits",
    formatter: formatNumber,
    icon: Instagram,
    iconBg: "bg-pink-50 dark:bg-pink-500/15",
    iconHoverBg: "group-hover:bg-pink-100 dark:group-hover:bg-pink-500/25",
    iconColor: "text-pink-600 dark:text-pink-400",
    tooltip: "Instagram profile visits attributed to your ads. Only tracked when an Instagram profile is connected to the ad account.",
    showWhenZero: false,
  },
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
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl p-6 border border-border/50">
              <div className="flex justify-between items-start mb-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl p-6 lg:p-5 border border-border/50">
              <div className="flex justify-between items-start mb-4 lg:mb-3">
                <Skeleton className="h-11 lg:h-10 w-11 lg:w-10 rounded-xl" />
                <Skeleton className="h-4 w-14 lg:w-12" />
              </div>
              <Skeleton className="h-3 w-24 lg:w-20 mb-2" />
              <Skeleton className="h-8 lg:h-7 w-32 lg:w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const primaryCards = KPI_CARDS.filter((c) => c.primary);
  const secondaryCards = KPI_CARDS.filter((c) => {
    if (c.primary) return false;
    if (c.showWhenZero === false && (metrics![c.metricKey] as number) === 0) return false;
    return true;
  });

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

    const compactValue = needsCurrency
      ? formatCurrencyCompact(value, currency)
      : card.formatter(value);

    const Icon = card.icon;

    const deltaPill = deltaValue !== null ? (
      <span
        className={cn(
          "inline-flex items-center text-xs font-bold",
          positive === true && "text-emerald-500",
          positive === false && "text-red-500",
          positive === null && "text-muted-foreground"
        )}
      >
        {positive === true && <TrendingUp className="h-3.5 w-3.5 mr-1" />}
        {positive === false && <TrendingDown className="h-3.5 w-3.5 mr-1" />}
        {positive === null && <Minus className="h-3.5 w-3.5 mr-1" />}
        {formatDelta(deltaValue)}
      </span>
    ) : null;

    return (
      <div
        key={card.label}
        className={cn(
          "bg-card p-6 rounded-xl border border-border/50 dark:border-white/[0.06] flex flex-col justify-between group",
          "hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-black/20 transition-all duration-300",
          !card.primary && "lg:p-5"
        )}
      >
        {/* Mobile / tablet layout */}
        <div className="lg:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="relative group/tip flex items-center gap-1">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                {card.label}
              </p>
              {card.tooltip && (
                <>
                  <Info className="h-3 w-3 text-muted-foreground/50" tabIndex={0} role="button" aria-label={`Info: ${card.label}`} />
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-56 max-w-[calc(100vw-2rem)] rounded-lg bg-popover border border-border shadow-lg p-2.5 text-[11px] leading-relaxed text-foreground/80 opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto group-focus-within/tip:opacity-100 group-focus-within/tip:pointer-events-auto transition-opacity">
                    {card.tooltip}
                  </div>
                </>
              )}
            </div>
            <div
              className={cn(
                "p-2 rounded-lg transition-colors",
                card.iconBg,
                card.iconHoverBg
              )}
            >
              <Icon className={cn("h-4 w-4", card.iconColor)} />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <h3 className="text-2xl font-light text-foreground">{compactValue}</h3>
            {deltaPill && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-xs font-semibold mb-1",
                  positive === true && "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  positive === false && "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400",
                  positive === null && "bg-muted text-muted-foreground"
                )}
              >
                {formatDelta(deltaValue)}
              </span>
            )}
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden lg:block">
          <div className="flex justify-between items-start mb-4">
            <div
              className={cn(
                "p-3 rounded-xl transition-colors",
                card.primary ? "" : "p-2.5",
                card.iconBg,
                card.iconHoverBg
              )}
            >
              <Icon className={cn("h-5 w-5", !card.primary && "h-4 w-4", card.iconColor)} />
            </div>
            {deltaPill}
          </div>
          <div>
            <div className="relative group/tip inline-flex items-center gap-1 mb-1">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                {card.label}
              </p>
              {card.tooltip && (
                <>
                  <Info className="h-3 w-3 text-muted-foreground/40 cursor-help" tabIndex={0} role="button" aria-label={`Info: ${card.label}`} />
                  <div className="absolute left-0 bottom-full mb-2 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-popover border border-border shadow-xl p-3 text-[11px] leading-relaxed text-foreground/80 opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto group-focus-within/tip:opacity-100 group-focus-within/tip:pointer-events-auto transition-opacity">
                    {card.tooltip}
                  </div>
                </>
              )}
            </div>
            <h3
              className={cn(
                "font-semibold text-foreground",
                card.primary ? "text-2xl lg:text-3xl" : "text-xl lg:text-2xl"
              )}
            >
              {formattedValue}
            </h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary metrics row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6 xl:grid-cols-5">
        {primaryCards.map(renderCard)}
      </div>

      {/* Secondary metrics row */}
      <div className={cn(
        "grid grid-cols-1 gap-4 lg:gap-6",
        secondaryCards.length <= 5 ? "lg:grid-cols-5" : "lg:grid-cols-3 xl:grid-cols-6"
      )}>
        {secondaryCards.map(renderCard)}
      </div>
    </div>
  );
}
