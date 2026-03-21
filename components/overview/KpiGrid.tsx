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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
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
            <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              {card.label}
            </p>
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
            <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">
              {card.label}
            </p>
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
        {secondaryCards.map(renderCard)}
      </div>
    </div>
  );
}
