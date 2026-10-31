"use client";

import { useMemo, useState } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { addDays, format, parseISO, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { BarChart3 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

const chartConfig = {
  // Same series colors as TeamTrendChart (theme chart pair).
  closed: { label: "Closed revenue", color: "hsl(var(--chart-1))" },
  paid: { label: "Paid revenue", color: "hsl(var(--chart-2))" },
  cumPaid: { label: "Paid — month to date", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

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
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2 md:pb-2">
        <div className="flex items-baseline gap-2">
          <CardTitle>Performance Trends</CardTitle>
          <CardDescription className="text-xs">by closing date</CardDescription>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={grouping}
          // Radix reports "" when the active item is clicked again; a grouping
          // can't be deselected, so ignore that.
          onValueChange={(v) => {
            if (v) setGrouping(v as Grouping);
          }}
          aria-label="Grouping"
        >
          {GROUPINGS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value} className="px-3">
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{CAPTIONS[grouping]}</p>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="size-5 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No closed or paid revenue in the last {PERIODS[grouping]}{" "}
              {grouping === "day" ? "days" : grouping === "week" ? "weeks" : "months"}.
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
              barGap={2}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => formatCents(v)}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as ChartDataPoint;
                  return (
                    <div className="grid min-w-32 gap-1.5 rounded-xl bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
                      <p className="font-medium">
                        {item.tooltipLabel}
                        {item.inProgress && (
                          <span className="font-normal text-muted-foreground"> · in progress</span>
                        )}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <span className="size-2.5 shrink-0 rounded-[2px] bg-[--color-closed]" />
                        <span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCents(item.closed)}
                          </span>{" "}
                          closed · {item.count} deal{item.count === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <span className="size-2.5 shrink-0 rounded-[2px] bg-[--color-paid]" />
                        <span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCents(item.paid)}
                          </span>{" "}
                          paid · {item.paidCount} deal{item.paidCount === 1 ? "" : "s"}
                        </span>
                      </p>
                      {item.cumPaid != null && (
                        <p className="border-t pt-1.5 text-muted-foreground">
                          Month to date (as of{" "}
                          {item.cumAsOf ? format(parseISO(item.cumAsOf), "MMM d") : "week end"}):{" "}
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCents(item.cumPaid)}
                          </span>{" "}
                          · {item.cumPaidCount} paid deal{item.cumPaidCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="closed"
                name="Closed revenue"
                fill="var(--color-closed)"
                radius={[6, 6, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                dataKey="paid"
                name="Paid revenue"
                fill="var(--color-paid)"
                radius={[6, 6, 0, 0]}
                maxBarSize={24}
              />
              {grouping === "week" && (
                <Line
                  dataKey="cumPaid"
                  name="Paid — month to date"
                  stroke="var(--color-cumPaid)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3, fill: "var(--color-cumPaid)", strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
