"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { DollarSign, Handshake, Megaphone, Wallet } from "lucide-react";
import { windowTrend } from "@/components/shared/windowTrend";
import { MetricSparkline } from "@/components/shared/MetricSparkline";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { RebillBar } from "@/components/overview/RebillProgress";
import { StatCard } from "@/components/overview/StatCard";
import { monthName } from "@/components/team/presentation";
import { formatCents } from "@/lib/format";
import { ratePct, runningTotal, type OverviewTrends } from "@/lib/metricSeries";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import type { DealMetricBucket } from "@/lib/deals";
import type { PayoutTrends } from "@/lib/payouts";
import type { TeamDirectoryPayload } from "@/components/team/types";
import type { TimeSeriesDataPoint } from "@/types/dashboard";

/** The slice of /api/admin/closers/stats the Overview reads. */
export interface SalesStats {
  window: DealMetricBucket;
  previous?: DealMetricBucket | null;
  closeRate: number;
  trends?: OverviewTrends | null;
}

// Closers-page mapping: sales/volume = chart-1, cash collected = chart-2.
const BLUE = "hsl(var(--chart-1))";
const GREEN = "hsl(var(--chart-2))";

interface AgencyPulseProps {
  sales?: { data?: SalesStats; isLoading: boolean; isError: boolean };
  payouts?: { data?: PayoutTrends; isLoading: boolean; isError: boolean };
  team: { data?: TeamDirectoryPayload; isLoading: boolean; isError: boolean; href: string };
  ads: {
    spend?: number;
    previousSpend?: number | null;
    roas?: number;
    spendingAccounts: number;
    series?: TimeSeriesDataPoint[];
    showTrend: boolean;
    isLoading: boolean;
    isError: boolean;
    rangeLabel: string;
  };
}

/**
 * Headline numbers from each part of the business, each card opening the page
 * it comes from: cash collected (Payout Tracker), new sales (Sales Overview),
 * recurring revenue + this month's re-bills (Clients / Team hub) and ad spend
 * under management (Meta, below).
 */
export function AgencyPulse({ sales, payouts, team, ads }: AgencyPulseProps) {
  const months = payouts?.data?.months;
  const current = months?.[months.length - 1];
  const previous = months?.[months.length - 2];

  // Stable trend props per data change — the sparklines are memoized.
  const trends = useMemo(() => {
    const day = (ymd: string) => format(parseISO(ymd), "MMM d");
    const rows = [...(ads.series ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return {
      collected: {
        points: (months ?? []).map((m) => ({
          label: format(new Date(m.year, m.month - 1, 1), "MMM yyyy"),
          value: m.totalPaid,
        })),
        color: GREEN,
        format: formatCents,
        caption: "Last 12 months",
        hint: "Per month",
      },
      sales: windowTrend(
        sales?.data?.trends?.window ?? undefined,
        (bs) => runningTotal(bs, (b) => b.closedRevenue),
        BLUE,
        formatCents
      ),
      spend:
        ads.showTrend && rows.length >= 2
          ? {
              points: rows.map((r) => ({ label: format(parseISO(r.date), "EEE, MMM d"), value: r.spend })),
              color: BLUE,
              format: (v: number) => formatCurrency(v),
              caption: `${day(rows[0].date)} – ${day(rows[rows.length - 1].date)}`,
              hint: "Per day",
            }
          : undefined,
    };
  }, [months, sales?.data?.trends, ads.series, ads.showTrend]);

  const totals = team.data?.totals;
  const retention = totals?.retention;
  const w = sales?.data?.window;
  // Columns follow the cards this admin can see (2–4); an odd third card
  // takes the 2-column row on its own.
  const count = 2 + (payouts ? 1 : 0) + (sales ? 1 : 0);

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        count === 4 && "xl:grid-cols-4",
        count === 3 && "xl:grid-cols-3"
      )}
    >
      {payouts && (
        <StatCard
          label="Revenue collected"
          icon={Wallet}
          href="/dashboard/closers/payouts"
          isLoading={payouts.isLoading && !current}
          value={payouts.isError && !current ? "—" : formatCents(current?.totalPaid ?? 0)}
          delta={
            current && previous ? <TrendDelta current={current.totalPaid} previous={previous.totalPaid} /> : undefined
          }
          sub={
            current
              ? `${ratePct(current.totalPaid, current.totalDue) ?? 0}% of ${formatCents(current.totalDue)} due · ${format(
                  new Date(current.year, current.month - 1, 1),
                  "MMMM"
                )}`
              : payouts.isError
                ? "Couldn't load the Payout Tracker"
                : "No payouts yet"
          }
        >
          {current ? (
            <MetricSparkline label="Revenue collected" {...trends.collected} />
          ) : (
            payouts.isLoading && <SparklinePlaceholder />
          )}
        </StatCard>
      )}
      {sales && (
        <StatCard
          label="Closed sales"
          icon={Handshake}
          href="/dashboard/closers"
          isLoading={sales.isLoading && !w}
          value={sales.isError && !w ? "—" : formatCents(w?.closedRevenue ?? 0)}
          delta={
            w ? <TrendDelta current={w.closedRevenue} previous={sales.data?.previous?.closedRevenue} /> : undefined
          }
          sub={
            w
              ? `${w.closedCount} deal${w.closedCount === 1 ? "" : "s"} · ${sales.data?.closeRate ?? 0}% close rate · this month`
              : sales.isError
                ? "Couldn't load sales stats"
                : "This month"
          }
        >
          {trends.sales ? (
            <MetricSparkline label="Closed sales" {...trends.sales} />
          ) : (
            sales.isLoading && <SparklinePlaceholder />
          )}
        </StatCard>
      )}
      <StatCard
        label="Monthly MRR"
        icon={DollarSign}
        href={team.href}
        isLoading={team.isLoading && !totals}
        value={team.isError && !totals ? "—" : formatCents(totals?.bookMrrCents ?? 0)}
        sub={
          totals
            ? `${totals.activeClients} active client${totals.activeClients === 1 ? "" : "s"}${
                team.data?.viewer.selfOnly ? " · your book" : ""
              }`
            : team.isError
              ? "Couldn't load the Team hub rollup"
              : "Active clients"
        }
      >
        {totals && (
          <div className="mt-auto space-y-1.5 pt-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">Re-bills · {monthName(totals.monthly.month)}</span>
              {retention && retention.base > 0 && (
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium text-foreground">
                    {retention.retained} of {retention.base}
                  </span>{" "}
                  re-billed
                </span>
              )}
            </div>
            <RebillBar monthly={totals.monthly} mrrCents={totals.bookMrrCents} />
          </div>
        )}
      </StatCard>
      <StatCard
        label="Ad spend"
        icon={Megaphone}
        href="#meta-ads"
        isLoading={ads.isLoading}
        value={ads.isError ? "—" : formatCurrency(ads.spend ?? 0)}
        delta={
          ads.previousSpend != null && ads.spend != null ? (
            <TrendDelta current={ads.spend} previous={ads.previousSpend} />
          ) : undefined
        }
        sub={
          ads.isError
            ? "Couldn't load Meta ad accounts"
            : `${ads.spendingAccounts} account${ads.spendingAccounts === 1 ? "" : "s"} · ${formatRoas(ads.roas ?? 0)} ROAS · ${ads.rangeLabel}`
        }
        className={cn(count === 3 && "sm:col-span-2 xl:col-span-1")}
      >
        {trends.spend ? (
          <MetricSparkline label="Ad spend" {...trends.spend} />
        ) : (
          ads.showTrend && !ads.series && <SparklinePlaceholder />
        )}
      </StatCard>
    </div>
  );
}
