"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { addDays, format, parseISO, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCents,
  CHART_CLOSED_COLOR,
  CHART_PAID_COLOR,
} from "@/components/closers/types";

/** Minimal deal shape the chart needs — matches lib/deals.ts ChartDeal and
 *  lets the admin drill-down and closer portal payloads feed it without
 *  casts. */
export interface PerformanceChartDeal {
  dealValue: number;
  status: string;
  paidStatus?: string | null;
  createdAt: string;
  closingDate?: string | null;
}

interface CloserPerformanceChartProps {
  deals: PerformanceChartDeal[];
}

type Grouping = "day" | "week" | "month";

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

// How far back each grouping looks. Buckets with no deals render as zero so
// quiet stretches stay visible instead of being silently skipped.
const PERIODS: Record<Grouping, number> = { day: 14, week: 12, month: 12 };

// Plain-language explainer per grouping. Buckets are whole calendar units
// (weeks run Mon–Sun) and ignore any time-frame filter on the page — the
// usual "cards say $52k, chart says $40.5k" confusion is an edge week
// counting days past the filter window, so say it outright.
const CAPTIONS: Record<Grouping, string> = {
  day: "Each bar is one calendar day. Deals count on the day they closed.",
  week: "Each bar is a full Mon–Sun calendar week, so its total can differ from cards filtered to a custom date range. Deals count on the day they closed.",
  month: "Each bar is a full calendar month, so its total can differ from cards filtered to a custom date range. Deals count on the day they closed.",
};

interface ChartDataPoint {
  key: string;
  label: string;
  tooltipLabel: string;
  /** The bucket containing today — flagged in the tooltip so a low current
   *  bar isn't read as a slump. */
  inProgress: boolean;
  /** Closed revenue in the bucket (status = closed). */
  closed: number;
  /** Paid revenue — closed or pending_signature deals marked paid. */
  paid: number;
  count: number;
  paidCount: number;
  /** Weekly view only: paid revenue month-to-date as of the END of this
   *  week (capped at today), so week 2 = weeks 1+2 and a week straddling a
   *  month boundary reports the NEW month's running total including its
   *  first days. Undefined in daily/monthly views. */
  cumPaid?: number;
  cumPaidCount?: number;
  /** Weekly view only: the yyyy-mm-dd the cumulative is "as of". */
  cumAsOf?: string;
}

/** The VIEWER-LOCAL day the deal was added, YYYY-MM-DD. `created_at` is a
 *  UTC instant (SQLite "YYYY-MM-DD HH:MM:SS" or ISO) — it must be converted
 *  to the viewer's local day because buildBuckets() keys are local; slicing
 *  the raw UTC string made evening-PT deals invisible in the Daily view
 *  (their UTC next-day key wasn't among the rendered buckets) and misfiled
 *  them at month boundaries. */
function addedDay(deal: PerformanceChartDeal): string {
  const raw = deal.createdAt;
  const d = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  return isNaN(d.getTime()) ? raw.slice(0, 10) : format(d, "yyyy-MM-dd");
}

/** The day a deal counts toward: `closing_date` when set (a plain
 *  admin-entered yyyy-mm-dd — no TZ conversion), else the added day. Matches
 *  aggregateBucket's COALESCE(closing_date, created day), so the chart's
 *  buckets agree with the stat cards and deals table — bucketing by added
 *  date alone misfiled deals closed in a different month than they were
 *  logged (e.g. added Jun 23, closed Jul 2 → missing from July). */
function metricDay(deal: PerformanceChartDeal): string {
  return deal.closingDate?.slice(0, 10) || addedDay(deal);
}

function bucketKey(day: string, grouping: Grouping): string {
  if (grouping === "month") return day.slice(0, 7);
  if (grouping === "week") {
    const d = parseISO(day);
    return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }
  return day;
}

interface BucketDef {
  key: string;
  label: string;
  tooltipLabel: string;
  /** True for the bucket containing today — its bar is still filling up. */
  inProgress: boolean;
}

function buildBuckets(grouping: Grouping): BucketDef[] {
  const now = new Date();
  const count = PERIODS[grouping];
  const out: BucketDef[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (grouping === "month") {
      const d = subMonths(now, i);
      out.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM"),
        tooltipLabel: format(d, "MMMM yyyy"),
        inProgress: i === 0,
      });
    } else if (grouping === "week") {
      const d = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const end = addDays(d, 6);
      // Spell out the full Mon–Sun span — "Week of Jun 15" hid that the
      // bucket runs through Jun 21, which read as a mismatch against
      // date-filtered cards ending mid-week.
      const sameMonth = format(d, "yyyy-MM") === format(end, "yyyy-MM");
      out.push({
        key: format(d, "yyyy-MM-dd"),
        label: format(d, "MMM d"),
        tooltipLabel: `${format(d, "MMM d")} – ${format(end, sameMonth ? "d, yyyy" : "MMM d, yyyy")}`,
        inProgress: i === 0,
      });
    } else {
      const d = subDays(now, i);
      out.push({
        key: format(d, "yyyy-MM-dd"),
        label: format(d, "MMM d"),
        tooltipLabel: format(d, "MMM d, yyyy"),
        inProgress: i === 0,
      });
    }
  }
  return out;
}

export function CloserPerformanceChart({ deals }: CloserPerformanceChartProps) {
  const [grouping, setGrouping] = useState<Grouping>("day");

  const chartData = useMemo(() => {
    const totals = new Map<
      string,
      { closed: number; paid: number; count: number; paidCount: number }
    >();
    for (const deal of deals) {
      const isClosed = deal.status === "closed";
      const isPaid =
        (deal.status === "closed" || deal.status === "pending_signature") &&
        deal.paidStatus === "paid";
      if (!isClosed && !isPaid) continue;
      const key = bucketKey(metricDay(deal), grouping);
      const entry = totals.get(key) ?? { closed: 0, paid: 0, count: 0, paidCount: 0 };
      if (isClosed) {
        entry.closed += deal.dealValue;
        entry.count += 1;
      }
      if (isPaid) {
        entry.paid += deal.dealValue;
        entry.paidCount += 1;
      }
      totals.set(key, entry);
    }
    const buckets = buildBuckets(grouping).map((b): ChartDataPoint => {
      const hit = totals.get(b.key);
      return {
        ...b,
        closed: hit?.closed ?? 0,
        paid: hit?.paid ?? 0,
        count: hit?.count ?? 0,
        paidCount: hit?.paidCount ?? 0,
      };
    });

    if (grouping === "week") {
      // "Paid — month to date" per week = paid revenue from the 1st of the
      // month through the END of that week (capped at today). Day-based so
      // a week straddling a month boundary reports the NEW month's running
      // total including its first days — assigning whole weeks to their
      // Monday's month silently dropped e.g. Jul 1–5 from July's MTD.
      const dayPaid = new Map<string, { paid: number; count: number }>();
      for (const deal of deals) {
        const isPaid =
          (deal.status === "closed" || deal.status === "pending_signature") &&
          deal.paidStatus === "paid";
        if (!isPaid) continue;
        const day = metricDay(deal);
        const entry = dayPaid.get(day) ?? { paid: 0, count: 0 };
        entry.paid += deal.dealValue;
        entry.count += 1;
        dayPaid.set(day, entry);
      }
      const todayYmd = format(new Date(), "yyyy-MM-dd");
      for (const b of buckets) {
        const weekEnd = format(addDays(parseISO(b.key), 6), "yyyy-MM-dd");
        const asOf = weekEnd < todayYmd ? weekEnd : todayYmd;
        const monthStart = `${asOf.slice(0, 7)}-01`;
        let cumPaid = 0;
        let cumPaidCount = 0;
        for (const [day, e] of dayPaid) {
          if (day >= monthStart && day <= asOf) {
            cumPaid += e.paid;
            cumPaidCount += e.count;
          }
        }
        b.cumPaid = cumPaid;
        b.cumPaidCount = cumPaidCount;
        b.cumAsOf = asOf;
      }
    }
    return buckets;
  }, [deals, grouping]);

  const hasData = chartData.some((p) => p.closed > 0 || p.paid > 0);

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">Performance Trends</h3>
          <span className="text-[11px] text-muted-foreground">by closing date</span>
        </div>
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
          {GROUPINGS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGrouping(opt.value)}
              aria-pressed={grouping === opt.value}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                grouping === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mb-5">{CAPTIONS[grouping]}</p>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mb-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No closed or paid revenue in the last {PERIODS[grouping]}{" "}
            {grouping === "day" ? "days" : grouping === "week" ? "weeks" : "months"}.
          </p>
        </div>
      ) : (
        <div style={{ width: "100%", height: 250, overflow: "hidden" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
              barGap={2}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => formatCents(v)}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as ChartDataPoint;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {item.tooltipLabel}
                        {item.inProgress && (
                          <span className="text-[10px] font-normal"> · in progress</span>
                        )}
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{formatCents(item.closed)}</span>{" "}
                        closed · {item.count} deal{item.count === 1 ? "" : "s"}
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{formatCents(item.paid)}</span> paid ·{" "}
                        {item.paidCount} deal{item.paidCount === 1 ? "" : "s"}
                      </p>
                      {item.cumPaid != null && (
                        <p className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border/50">
                          Month to date (as of{" "}
                          {item.cumAsOf ? format(parseISO(item.cumAsOf), "MMM d") : "week end"}):{" "}
                          <span className="font-semibold text-foreground">
                            {formatCents(item.cumPaid)}
                          </span>{" "}
                          · {item.cumPaidCount} paid deal{item.cumPaidCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
              <Bar
                dataKey="closed"
                name="Closed revenue"
                fill={CHART_CLOSED_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                dataKey="paid"
                name="Paid revenue"
                fill={CHART_PAID_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
              {grouping === "week" && (
                <Line
                  dataKey="cumPaid"
                  name="Paid — month to date"
                  stroke={CHART_PAID_COLOR}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3, fill: CHART_PAID_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
