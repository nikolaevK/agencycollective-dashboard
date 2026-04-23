"use client";

import { CalendarCheck, DollarSign, PhoneIncoming, Target, TrendingUp, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";

interface Props {
  appointmentsSet: number;
  showRate: number;
  showCount: number;
  noShowCount: number;
  dealsLinked: number;
  dealsClosed: number;
  revenueAttributed: number;
  commissionEarned: number;
  pendingDeals: number;
  followUpCount: number;
}

interface Card {
  key: string;
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  value: (p: Props) => string;
  sub: (p: Props) => string;
}

const CARDS: Card[] = [
  {
    key: "commission",
    label: "Commission Paid",
    icon: DollarSign,
    iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    value: (p) => formatCents(p.commissionEarned),
    sub: () => "On paid closed deals",
  },
  {
    key: "revenue",
    label: "Revenue Attributed",
    icon: TrendingUp,
    iconBg: "bg-violet-100 dark:bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
    value: (p) => formatCents(p.revenueAttributed),
    sub: (p) => `${p.dealsClosed} closed deal${p.dealsClosed === 1 ? "" : "s"}`,
  },
  {
    key: "appointments",
    label: "Appointments",
    icon: CalendarCheck,
    iconBg: "bg-blue-100 dark:bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    value: (p) => String(p.appointmentsSet),
    sub: () => "Claimed by you",
  },
  {
    key: "showRate",
    label: "Show Rate",
    icon: UserCheck,
    iconBg: "bg-cyan-100 dark:bg-cyan-500/15",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    value: (p) => `${p.showRate}%`,
    sub: (p) => {
      const total = p.showCount + p.noShowCount;
      return total > 0 ? `${p.showCount} showed / ${p.noShowCount} no-show` : "No data yet";
    },
  },
  {
    key: "pending",
    label: "Pending Deals",
    icon: Target,
    iconBg: "bg-amber-100 dark:bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    value: (p) => String(p.pendingDeals),
    sub: (p) => `${p.dealsLinked} total linked`,
  },
  {
    key: "followups",
    label: "Follow-ups",
    icon: PhoneIncoming,
    iconBg: "bg-pink-100 dark:bg-pink-500/15",
    iconColor: "text-pink-600 dark:text-pink-400",
    value: (p) => String(p.followUpCount),
    sub: () => "Appointments needing a call",
  },
];

export function SetterBentoGrid(props: Props) {
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
            <p className="text-xl sm:text-2xl font-bold text-foreground">{card.value(props)}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub(props)}</p>
          </div>
        );
      })}
    </div>
  );
}
