"use client";

import { DollarSign, FileCheck, Target, TrendingUp, UserCheck, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import { InlineQuotaEditor } from "./InlineQuotaEditor";

interface Props {
  totalRevenue: number;
  dealCount: number;
  closedCount: number;
  avgDealValue: number;
  showRate?: number;
  showCount?: number;
  noShowCount?: number;
  quota?: number; // cents
}

interface CardDef {
  key: string;
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  getValue: (p: Props) => string;
  getSub: (p: Props) => string;
  custom?: boolean;
}

const CARDS: CardDef[] = [
  {
    key: "revenue",
    label: "Total Revenue",
    icon: DollarSign,
    iconBg: "bg-violet-100 dark:bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
    getValue: (p) => formatCents(p.totalRevenue),
    getSub: () => "Closed deals",
  },
  {
    key: "deals",
    label: "Deals Completed",
    icon: FileCheck,
    iconBg: "bg-blue-100 dark:bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    getValue: (p) => String(p.dealCount),
    getSub: (p) => `${p.closedCount} closed`,
  },
  {
    key: "rate",
    label: "Close Rate",
    icon: Target,
    iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    getValue: (p) =>
      p.dealCount > 0
        ? `${((p.closedCount / p.dealCount) * 100).toFixed(1)}%`
        : "0%",
    getSub: () => "Conversion rate",
  },
  {
    key: "show_rate",
    label: "Show Rate",
    icon: UserCheck,
    iconBg: "bg-cyan-100 dark:bg-cyan-500/15",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    getValue: (p) => `${p.showRate ?? 0}%`,
    getSub: (p) => {
      const total = (p.showCount ?? 0) + (p.noShowCount ?? 0);
      return total > 0 ? `${p.showCount} showed / ${p.noShowCount} no-show` : "No data yet";
    },
  },
  {
    key: "avg",
    label: "Avg Deal Value",
    icon: TrendingUp,
    iconBg: "bg-amber-100 dark:bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    getValue: (p) => formatCents(p.avgDealValue),
    getSub: () => "Per closed deal",
  },
  {
    key: "quota",
    label: "Monthly Target",
    icon: Crosshair,
    iconBg: "bg-pink-100 dark:bg-pink-500/15",
    iconColor: "text-pink-600 dark:text-pink-400",
    getValue: () => "",
    getSub: () => "Your monthly goal",
    custom: true,
  },
];

export function CloserBentoGrid(props: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 sm:p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", card.iconBg)}>
                <Icon className={cn("h-4 w-4", card.iconColor)} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
            </div>
            {card.custom && card.key === "quota" ? (
              <>
                <InlineQuotaEditor currentQuota={props.quota ?? 0} />
                <p className="text-xs text-muted-foreground mt-1">{card.getSub(props)}</p>
              </>
            ) : (
              <>
                <p className="text-xl sm:text-2xl font-bold text-foreground">{card.getValue(props)}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.getSub(props)}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
