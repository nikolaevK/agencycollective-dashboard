"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
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
import { cn } from "@/lib/utils";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import { monthlyTrend, windowTrend, type CardTrend } from "@/components/shared/windowTrend";
import { runningTotal, type SetterTrends } from "@/lib/metricSeries";

// Lazy: recharts only loads once there's a line to draw.
const MetricSparkline = dynamic(
  () => import("@/components/shared/MetricSparkline").then((m) => m.MetricSparkline),
  { loading: () => <SparklinePlaceholder /> }
);

// Theme chart pair (globals.css) — closed vs paid, as on the closer cards.
const CLOSED_COLOR = "hsl(var(--chart-1))";
const PAID_COLOR = "hsl(var(--chart-2))";
const asCount = (v: number) => String(v);

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
  /** Card trend lines (the stats route's `trends=1`); none drawn without.
   *  Commission and show rate stay plain: tier math / per-event attendance. */
  trends?: SetterTrends | null;
}

export function SetterBentoGrid({ lifetime, window, windowLabel, isLifetimeWindow, followUpCount, trends }: Props) {
  // Stable per payload — the sparklines are memoized.
  const lines = useMemo(() => {
    const months = trends?.lifetime;
    const win = trends?.window;
    return {
      appointments: monthlyTrend(months, (b) => b.appointments, CLOSED_COLOR, asCount),
      deals: monthlyTrend(months, (b) => b.closedCount, CLOSED_COLOR, asCount),
      winAppointments: windowTrend(win, (bs) => runningTotal(bs, (b) => b.appointments), CLOSED_COLOR, asCount),
      winRevenue: windowTrend(win, (bs) => runningTotal(bs, (b) => b.closedRevenue), CLOSED_COLOR, formatCents),
      winPaid: windowTrend(win, (bs) => runningTotal(bs, (b) => b.paidRevenue), PAID_COLOR, formatCents),
    } satisfies Record<string, CardTrend | undefined>;
  }, [trends]);

  return (
    <div className="space-y-6 mb-6">
      <Section
        title="Lifetime"
        subtitle="Your full setting history"
        gridClassName="lg:grid-cols-4"
        cards={[
          {
            key: "lifetime-appointments",
            label: "Appointments set",
            icon: CalendarCheck,
            value: String(lifetime.appointmentsSet),
            sub: "Claimed by you",
            trend: lines.appointments,
          },
          {
            key: "lifetime-deals",
            label: "Deals credited",
            icon: Award,
            value: String(lifetime.dealsClosed),
            sub: `${lifetime.dealsLinked} total linked`,
            trend: lines.deals,
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
            gridClassName="lg:grid-cols-4"
            cards={[
              {
                key: "win-appointments",
                label: "Appointments set",
                icon: CalendarCheck,
                value: String(window.appointmentsSet),
                sub: "Claimed in this window",
                trend: lines.winAppointments,
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
                trend: lines.winRevenue,
              },
              {
                key: "win-paid-revenue",
                label: "Paid revenue attributed",
                icon: DollarSign,
                value: formatCents(window.paidRevenueAttributed),
                sub: "Closed and paid",
                trend: lines.winPaid,
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
  trend?: CardTrend;
}

function Section({
  title,
  subtitle,
  cards,
  gridClassName,
}: {
  title: string;
  subtitle: string;
  cards: CardDef[];
  /** Wide-screen columns — sized to the card count so no row is orphaned. */
  gridClassName?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", gridClassName)}>
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
                {card.trend && <MetricSparkline label={card.label} {...card.trend} />}
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
