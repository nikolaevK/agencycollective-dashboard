"use client";

import { Users, Percent, Activity, DollarSign } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
    },
    {
      label: "Avg Commission",
      value: formatBasisPoints(avgCommission),
      subtitle: "Average rate",
      icon: Percent,
    },
    {
      label: "Active Closers",
      value: String(active),
      subtitle: `${total - active} inactive`,
      icon: Activity,
    },
    {
      label: "Total Quota",
      value: formatCents(totalRevenueCents),
      subtitle: "Combined quota",
      icon: DollarSign,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <CardDescription>{card.label}</CardDescription>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-semibold tracking-tight tabular-nums truncate">
                {card.value}
              </div>
              <p className="text-xs text-muted-foreground truncate">{card.subtitle}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
