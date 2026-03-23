"use client";

import { Users, Percent, Activity, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCents,
  formatBasisPoints,
  type CloserPublic,
} from "@/components/closers/types";

interface CloserManageMetricsProps {
  closers: CloserPublic[];
}

export function CloserManageMetrics({ closers }: CloserManageMetricsProps) {
  const total = closers.length;
  const active = closers.filter((c) => c.status === "active").length;
  const avgCommission =
    total > 0
      ? Math.round(closers.reduce((s, c) => s + c.commissionRate, 0) / total)
      : 0;
  const totalRevenueCents = closers.reduce((s, c) => s + c.quota, 0);

  const cards = [
    {
      label: "Total Closers",
      value: String(total),
      subtitle: `${active} active`,
      icon: Users,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
      gradient: false,
    },
    {
      label: "Avg Commission",
      value: formatBasisPoints(avgCommission),
      subtitle: "Average rate",
      icon: Percent,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      gradient: false,
    },
    {
      label: "Active Now",
      value: String(active),
      subtitle: "Currently active",
      icon: Activity,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      gradient: false,
      pulse: true,
    },
    {
      label: "Total Quota",
      value: formatCents(totalRevenueCents),
      subtitle: "Combined quota",
      icon: DollarSign,
      iconBg: "bg-white/20",
      iconColor: "text-white",
      gradient: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border p-5",
              card.gradient
                ? "ac-gradient border-transparent text-white"
                : "border-border/50 dark:border-white/[0.06] bg-card"
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  card.iconBg
                )}
              >
                <Icon className={cn("h-5 w-5", card.iconColor)} />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-xs font-medium",
                    card.gradient
                      ? "text-white/70"
                      : "text-muted-foreground"
                  )}
                >
                  {card.label}
                </p>
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "text-lg font-bold truncate",
                      card.gradient ? "text-white" : "text-foreground"
                    )}
                  >
                    {card.value}
                  </p>
                  {card.pulse && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-xs truncate",
                    card.gradient
                      ? "text-white/60"
                      : "text-muted-foreground"
                  )}
                >
                  {card.subtitle}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
