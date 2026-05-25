"use client";

import { Users, CheckCircle2, DollarSign, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "./format";

interface ClientSummaryCardsProps {
  totalClients: number;
  activeClients: number;
  totalMrr: number; // cents
  rebillsDue: number;
  overdueCount: number;
  onRebillsClick?: () => void;
  isLoading?: boolean;
}

export function ClientSummaryCards({
  totalClients,
  activeClients,
  totalMrr,
  rebillsDue,
  overdueCount,
  onRebillsClick,
  isLoading,
}: ClientSummaryCardsProps) {
  const cards = [
    {
      label: "Total Clients",
      value: String(totalClients),
      icon: Users,
      color: "text-foreground",
      sub: undefined as string | undefined,
    },
    {
      label: "Active",
      value: String(activeClients),
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      sub: undefined,
    },
    {
      label: "Monthly MRR",
      value: formatMoney(totalMrr),
      icon: DollarSign,
      color: "text-foreground",
      sub: "Active clients only",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <card.icon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
          </div>
          {isLoading ? (
            <div className="h-8 w-24 rounded bg-muted/50 animate-pulse mt-1" />
          ) : (
            <>
              <p className={cn("text-2xl font-bold mt-1", card.color)}>{card.value}</p>
              {card.sub && (
                <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
              )}
            </>
          )}
        </div>
      ))}

      {/* Re-bills due — clickable to filter the table */}
      <button
        type="button"
        onClick={onRebillsClick}
        className={cn(
          "rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 text-left transition-all",
          "hover:border-primary/30 hover:shadow-sm cursor-pointer"
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Re-bills Due</p>
        </div>
        {isLoading ? (
          <div className="h-8 w-16 rounded bg-muted/50 animate-pulse mt-1" />
        ) : (
          <>
            <p
              className={cn(
                "text-2xl font-bold mt-1",
                rebillsDue > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
              )}
            >
              {rebillsDue}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overdueCount > 0 ? `${overdueCount} overdue` : "none overdue"}
            </p>
          </>
        )}
      </button>
    </div>
  );
}
