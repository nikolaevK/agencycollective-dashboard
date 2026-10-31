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
import { formatCents } from "@/components/closers/types";
import { SETTER_TIER_LABELS } from "@/lib/appointmentRules";
import type { SetterMetricBucket, SetterTierBreakdown } from "@/lib/setterStats";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/** Status-dot color per tier (Badge pattern) — same hues as SETTER_TIER_BADGE. */
const TIER_TONE: Record<"A" | "B" | "C" | "D", BadgeTone> = {
  A: "success",
  B: "info",
  C: "warning",
  D: "neutral",
};

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
            value: String(lifetime.appointmentsSet),
            sub: "Claimed by you",
          },
          {
            key: "lifetime-deals",
            label: "Deals credited",
            icon: Award,
            value: String(lifetime.dealsClosed),
            sub: `${lifetime.dealsLinked} total linked`,
          },
          {
            key: "lifetime-commission",
            label: "Commission earned",
            icon: Wallet,
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
                value: String(window.appointmentsSet),
                sub: "Claimed in this window",
              },
              {
                key: "win-show",
                label: "Show rate",
                icon: UserCheck,
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
                value: formatCents(window.revenueAttributed),
                sub: `${window.dealsClosed} deal${window.dealsClosed === 1 ? "" : "s"} closed`,
              },
              {
                key: "win-paid-revenue",
                label: "Paid revenue attributed",
                icon: DollarSign,
                value: formatCents(window.paidRevenueAttributed),
                sub: "Closed and paid",
              },
              {
                key: "win-commission-earned",
                label: "Commission earned",
                icon: Wallet,
                value: formatCents(window.commissionEarned),
                sub: "Across all tiers",
              },
              {
                key: "win-commission-pending",
                label: "Commission pending",
                icon: Clock,
                value: formatCents(window.commissionPending),
                sub: "On closed-unpaid A/B deals",
              },
              {
                key: "win-pending-deals",
                label: "Pending deals",
                icon: Target,
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
  value: string;
  sub: string;
}

function Section({ title, subtitle, cards }: { title: string; subtitle: string; cards: CardDef[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
                <CardDescription>{card.label}</CardDescription>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
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
      commission: 0,
      volume: `${breakdown.tierD.dealCount} deal${breakdown.tierD.dealCount === 1 ? "" : "s"} · no payout`,
    },
  ];
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">Per 1099 contract §3.3</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 md:pb-2">
              <StatusBadge tone={TIER_TONE[card.key]}>Tier {card.key}</StatusBadge>
              <CardDescription className="min-w-0 truncate text-xs">
                {SETTER_TIER_LABELS[card.key]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">
                {card.key === "D" ? "$0" : formatCents(card.commission)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{card.volume}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
