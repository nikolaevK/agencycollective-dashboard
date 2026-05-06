"use client";

import {
  Award,
  CalendarCheck,
  Clock,
  DollarSign,
  PhoneIncoming,
  Target,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import { SETTER_TIER_BADGE, SETTER_TIER_LABELS } from "@/lib/appointments";
import type { SetterMetricBucket, SetterTierBreakdown } from "@/lib/setterStats";

interface Props {
  lifetime: SetterMetricBucket;
  window: SetterMetricBucket;
  windowLabel: string;
  isLifetimeWindow: boolean;
  /** Total appointments needing a follow-up call (always lifetime — the
   *  needs_followup queue isn't bucketed by date). */
  followUpCount: number;
}

export function SetterBentoGrid({ lifetime, window, windowLabel, isLifetimeWindow, followUpCount }: Props) {
  return (
    <div className="space-y-6 mb-6">
      <Section
        title="Lifetime"
        subtitle="Your full setting history"
        cards={[
          {
            key: "lifetime-appointments",
            label: "Appointments set",
            icon: CalendarCheck,
            iconBg: "bg-blue-100 dark:bg-blue-500/15",
            iconColor: "text-blue-600 dark:text-blue-400",
            value: String(lifetime.appointmentsSet),
            sub: "Claimed by you",
          },
          {
            key: "lifetime-deals",
            label: "Deals credited",
            icon: Award,
            iconBg: "bg-violet-100 dark:bg-violet-500/15",
            iconColor: "text-violet-600 dark:text-violet-400",
            value: String(lifetime.dealsClosed),
            sub: `${lifetime.dealsLinked} total linked`,
          },
          {
            key: "lifetime-commission",
            label: "Commission earned",
            icon: Wallet,
            iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
            iconColor: "text-emerald-600 dark:text-emerald-400",
            value: formatCents(lifetime.commissionEarned),
            sub:
              lifetime.commissionPending > 0
                ? `${formatCents(lifetime.commissionPending)} pending payment`
                : "Across all tiers",
          },
          {
            key: "followups",
            label: "Follow-ups",
            icon: PhoneIncoming,
            iconBg: "bg-pink-100 dark:bg-pink-500/15",
            iconColor: "text-pink-600 dark:text-pink-400",
            value: String(followUpCount),
            sub: "Appointments needing a call",
          },
        ]}
      />

      <TierBreakdownPanel
        title="Tier breakdown — lifetime"
        breakdown={lifetime.tierBreakdown}
      />

      {!isLifetimeWindow && (
        <>
          <Section
            title={windowLabel}
            subtitle="Selected time frame"
            cards={[
              {
                key: "win-appointments",
                label: "Appointments set",
                icon: CalendarCheck,
                iconBg: "bg-blue-100 dark:bg-blue-500/15",
                iconColor: "text-blue-600 dark:text-blue-400",
                value: String(window.appointmentsSet),
                sub: "Claimed in this window",
              },
              {
                key: "win-show",
                label: "Show rate",
                icon: UserCheck,
                iconBg: "bg-cyan-100 dark:bg-cyan-500/15",
                iconColor: "text-cyan-600 dark:text-cyan-400",
                value: `${window.showRate}%`,
                sub:
                  window.showCount + window.noShowCount > 0
                    ? `${window.showCount} showed · ${window.noShowCount} no-show`
                    : "No data this window",
              },
              {
                key: "win-revenue",
                label: "Revenue attributed",
                icon: TrendingUp,
                iconBg: "bg-violet-100 dark:bg-violet-500/15",
                iconColor: "text-violet-600 dark:text-violet-400",
                value: formatCents(window.revenueAttributed),
                sub: `${window.dealsClosed} deal${window.dealsClosed === 1 ? "" : "s"} closed`,
              },
              {
                key: "win-paid-revenue",
                label: "Paid revenue attributed",
                icon: DollarSign,
                iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
                iconColor: "text-emerald-600 dark:text-emerald-400",
                value: formatCents(window.paidRevenueAttributed),
                sub: "Closed and paid",
              },
              {
                key: "win-commission-earned",
                label: "Commission earned",
                icon: Wallet,
                iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
                iconColor: "text-emerald-600 dark:text-emerald-400",
                value: formatCents(window.commissionEarned),
                sub: "Across all tiers",
              },
              {
                key: "win-commission-pending",
                label: "Commission pending",
                icon: Clock,
                iconBg: "bg-amber-100 dark:bg-amber-500/15",
                iconColor: "text-amber-600 dark:text-amber-400",
                value: formatCents(window.commissionPending),
                sub: "On closed-unpaid A/B deals",
              },
              {
                key: "win-pending-deals",
                label: "Pending deals",
                icon: Target,
                iconBg: "bg-amber-100 dark:bg-amber-500/15",
                iconColor: "text-amber-600 dark:text-amber-400",
                value: String(window.pendingDeals),
                sub: "Awaiting signature / follow-up",
              },
            ]}
          />
          <TierBreakdownPanel
            title={`Tier breakdown — ${windowLabel}`}
            breakdown={window.tierBreakdown}
          />
        </>
      )}
    </div>
  );
}

interface CardDef {
  key: string;
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  value: string;
  sub: string;
}

function Section({ title, subtitle, cards }: { title: string; subtitle: string; cards: CardDef[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => {
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
              <p className="text-xl sm:text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact 4-card row showing what each tier earned. Mirrors Section's
 *  visual language but each card is tier-specific so the setter can see at a
 *  glance which tier is driving their commission and which tiers are quiet. */
function TierBreakdownPanel({
  title,
  breakdown,
}: {
  title: string;
  breakdown: SetterTierBreakdown;
}) {
  const cards: { key: "A" | "B" | "C" | "D"; commission: number; volume: string }[] = [
    {
      key: "A",
      commission: breakdown.tierA.commission,
      volume: `${breakdown.tierA.dealCount} deal${breakdown.tierA.dealCount === 1 ? "" : "s"} · ${formatCents(breakdown.tierA.paidRevenue)} paid`,
    },
    {
      key: "B",
      commission: breakdown.tierB.commission,
      volume: `${breakdown.tierB.dealCount} deal${breakdown.tierB.dealCount === 1 ? "" : "s"} · ${formatCents(breakdown.tierB.paidRevenue)} paid`,
    },
    {
      key: "C",
      commission: breakdown.tierC.commission,
      volume: `${breakdown.tierC.attendedCount} attended call${breakdown.tierC.attendedCount === 1 ? "" : "s"}`,
    },
    {
      key: "D",
      commission: breakdown.tierD.dealCount > 0 ? 0 : 0,
      volume: `${breakdown.tierD.dealCount} deal${breakdown.tierD.dealCount === 1 ? "" : "s"} · no payout`,
    },
  ];
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">Per 1099 contract §3.3</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 sm:p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                  SETTER_TIER_BADGE[card.key]
                )}
              >
                Tier {card.key}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                {SETTER_TIER_LABELS[card.key]}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">
              {card.key === "D" ? "$0" : formatCents(card.commission)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{card.volume}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
