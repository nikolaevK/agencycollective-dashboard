"use client";

import { DollarSign, FileCheck, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";

interface Props {
  totalRevenue: number;
  dealCount: number;
  closedCount: number;
  avgDealValue: number;
}

const CARDS = [
  {
    key: "revenue",
    label: "Total Revenue",
    icon: DollarSign,
    iconBg: "bg-violet-100 dark:bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
    getValue: (p: Props) => formatCents(p.totalRevenue),
    getSub: () => "Closed deals",
    span: "col-span-2 sm:col-span-1",
  },
  {
    key: "deals",
    label: "Deals Completed",
    icon: FileCheck,
    iconBg: "bg-blue-100 dark:bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    getValue: (p: Props) => String(p.dealCount),
    getSub: (p: Props) => `${p.closedCount} closed`,
    span: "",
  },
  {
    key: "rate",
    label: "Close Rate",
    icon: Target,
    iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    getValue: (p: Props) =>
      p.dealCount > 0
        ? `${((p.closedCount / p.dealCount) * 100).toFixed(1)}%`
        : "0%",
    getSub: () => "Conversion rate",
    span: "",
  },
  {
    key: "avg",
    label: "Avg Deal Value",
    icon: TrendingUp,
    iconBg: "bg-amber-100 dark:bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    getValue: (p: Props) => formatCents(p.avgDealValue),
    getSub: () => "Per closed deal",
    span: "",
  },
];

export function CloserBentoGrid(props: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className={cn(
            "rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 sm:p-5",
            card.span
          )}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", card.iconBg)}>
              <card.icon className={cn("h-4 w-4", card.iconColor)} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{card.getValue(props)}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.getSub(props)}</p>
        </div>
      ))}
    </div>
  );
}
