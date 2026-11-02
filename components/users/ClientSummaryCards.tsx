"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";
import { DollarSign, RefreshCcw, Send, Users, CalendarClock } from "lucide-react";
import { StatCard } from "@/components/overview/StatCard";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import type { MetricSparkline as MetricSparklineType } from "@/components/shared/MetricSparkline";
import { effectiveMrrCents } from "./rosterPresentation";
import { formatMoney } from "./format";
import { rosterByMonth, sumSeries, type ClientTrends } from "@/lib/clientTrendSeries";
import { buildMonthlyRebillProgress, monthlyRetentionOf } from "@/lib/teamRebill";
import type { ClientPublic } from "./types";

// Lazy: recharts only loads once the cards render a line.
const MetricSparkline = dynamic(
  () => import("@/components/shared/MetricSparkline").then((m) => m.MetricSparkline),
  { loading: () => <SparklinePlaceholder /> }
);
type CardTrend = Omit<React.ComponentProps<typeof MetricSparklineType>, "label">;

// Same mapping as the Closers / Payout Tracker cards: billed = chart-1,
// re-bill = chart-4.
const BLUE = "hsl(var(--chart-1))";
const MAGENTA = "hsl(var(--chart-4))";
const asCount = (v: number) => String(v);

interface ClientSummaryCardsProps {
  /** The clients in the page's workspace context (every status). */
  clients: ClientPublic[];
  /** Read-only 12-month payout activity per client (/api/admin/clients/trends). */
  trends?: ClientTrends;
  trendsLoading?: boolean;
  /** "yyyy-mm" business month the cards describe (the trend window's last month). */
  month: string;
  /** null = the alerts feed failed to load (renders "—", never a false 0). */
  rebillsDue: number | null;
  overdueCount: number;
  /** MRR of the clients whose re-bill is due/overdue. */
  dueMrr: number;
  /** null = the sent-invoices feed failed to load (renders "—", never a false 0). */
  sentInvoices: number | null;
  /** Σ amount of the invoices awaiting payment (cents). */
  sentAmount: number;
  onRebillsClick?: () => void;
  onSentInvoicesClick?: () => void;
  isLoading?: boolean;
}

const monthLabel = (ym: string, pattern = "MMM yyyy") => format(parseISO(`${ym}-01`), pattern);

export function ClientSummaryCards({
  clients,
  trends,
  trendsLoading,
  month,
  rebillsDue,
  overdueCount,
  dueMrr,
  sentInvoices,
  sentAmount,
  onRebillsClick,
  onSentInvoicesClick,
  isLoading,
}: ClientSummaryCardsProps) {
  const totals = useMemo(() => {
    const active = clients.filter((c) => c.status === "active");
    const onboarding = clients.filter((c) => c.status === "onboarding").length;
    // Monthly MRR reflects ACTIVE clients only — paused/onboarding/inactive/
    // archived clients don't count toward recurring revenue even though their
    // row still shows its own MRR. PepAds clients contribute their manual MRR.
    const mrr = active.reduce((s, c) => s + effectiveMrrCents(c), 0);
    // This month's re-bill retention, bucketed exactly like the Team hub
    // tracker (lib/teamRebill): active clients, PepAds untracked.
    const monthly = buildMonthlyRebillProgress(
      active.map((c) => ({
        rebill: c.profile.book === "pepads" ? null : c.schedule,
        mrrCents: effectiveMrrCents(c),
      })),
      month
    );
    return {
      active: active.length,
      onboarding,
      mrr,
      retention: monthlyRetentionOf(monthly),
    };
  }, [clients, month]);

  // Built per data change, not per render (the page re-renders on every
  // filter keystroke and the memoized sparklines compare these objects).
  // No lines until the clients are in — an empty id set would draw zeros.
  const series = useMemo(() => {
    const months = isLoading ? undefined : trends?.months;
    const ids = new Set(clients.map((c) => c.id));
    // Re-billed follows the same clients as its subtitle: active ones.
    const activeIds = new Set(clients.filter((c) => c.status === "active").map((c) => c.id));
    // Known join dates only (unknown = on the roster from the start).
    const roster = months ? rosterByMonth(clients.map((c) => c.knownJoinedAt ?? null), months) : null;
    const billed = months && trends ? sumSeries(trends, "billed", ids) : null;
    const rebilled = months && trends ? sumSeries(trends, "rebilled", activeIds) : null;
    const line = (values: number[], color: string, fmt: (v: number) => string, caption: string, hint: string): CardTrend => ({
      points: values.map((value, i) => ({ label: monthLabel(months![i]), value })),
      color,
      format: fmt,
      caption,
      hint,
    });
    return {
      roster,
      rebilled,
      rosterTrend: roster ? line(roster, BLUE, asCount, "Last 12 months", "By join date") : undefined,
      billedTrend: billed ? line(billed, BLUE, formatMoney, "Billed per month", "Payout DB") : undefined,
      rebilledTrend: rebilled ? line(rebilled, MAGENTA, formatMoney, "REBILL payouts", "Per month") : undefined,
    };
  }, [clients, trends, isLoading]);

  const last = (v: number[] | null) => (v && v.length > 0 ? v[v.length - 1] : null);
  const prev = (v: number[] | null) => (v && v.length > 1 ? v[v.length - 2] : null);
  const rebilledNow = last(series.rebilled);
  const sparkFallback = trendsLoading ? <SparklinePlaceholder /> : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Total Clients"
        icon={Users}
        value={String(clients.length)}
        delta={<TrendDelta current={clients.length} previous={prev(series.roster)} />}
        sub={`${totals.active} active${totals.onboarding > 0 ? ` · ${totals.onboarding} onboarding` : ""}`}
        isLoading={isLoading}
      >
        {series.rosterTrend ? <MetricSparkline label="Total clients" {...series.rosterTrend} /> : sparkFallback}
      </StatCard>

      <StatCard
        label="Monthly MRR"
        icon={DollarSign}
        value={formatMoney(totals.mrr)}
        sub={`Active clients only${totals.active > 0 ? ` · avg ${formatMoney(totals.mrr / totals.active)}` : ""}`}
        isLoading={isLoading}
      >
        {series.billedTrend ? <MetricSparkline label="Billed per month" {...series.billedTrend} /> : sparkFallback}
      </StatCard>

      <StatCard
        label="Re-billed"
        icon={RefreshCcw}
        value={rebilledNow == null ? "—" : formatMoney(rebilledNow)}
        sub={
          totals.retention.base > 0
            ? `${totals.retention.retained} of ${totals.retention.base} active clients re-billed in ${monthLabel(month, "MMMM")}`
            : `In ${monthLabel(month, "MMMM")}`
        }
        isLoading={isLoading || (trendsLoading && !trends)}
      >
        {series.rebilledTrend ? <MetricSparkline label="Re-billed per month" {...series.rebilledTrend} /> : sparkFallback}
      </StatCard>

      <StatCard
        label="Re-bills Due"
        icon={CalendarClock}
        value={rebillsDue == null ? "—" : String(rebillsDue)}
        sub={
          rebillsDue === null
            ? "Couldn’t load alerts"
            : rebillsDue === 0
              ? "None due right now"
              : `${overdueCount > 0 ? `${overdueCount} overdue · ` : "None overdue · "}${formatMoney(dueMrr)} MRR to bill`
        }
        onClick={onRebillsClick}
        isLoading={isLoading}
      />

      <StatCard
        label="Invoices Sent"
        icon={Send}
        value={sentInvoices == null ? "—" : String(sentInvoices)}
        sub={
          sentInvoices == null
            ? "Couldn’t load invoices"
            : sentInvoices === 0
              ? "None awaiting payment"
              : `${formatMoney(sentAmount)} awaiting payment`
        }
        onClick={onSentInvoicesClick}
        isLoading={isLoading}
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
}
