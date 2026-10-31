"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { BarChart3 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PayoutMonthPoint } from "@/lib/payouts";

// Bars: rebill (recurring base) → new → ad account, validated as a trio
// (globals.css). "Collected" is a neutral line — a different mark, no 4th hue.
const chartConfig = {
  rebill: { label: "Rebill", color: "hsl(var(--chart-4))" },
  new: { label: "New", color: "hsl(var(--chart-1))" },
  adAccount: { label: "Ad account", color: "hsl(var(--chart-3))" },
  collected: { label: "Collected", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

type SeriesKey = keyof typeof chartConfig;

interface Props {
  months: PayoutMonthPoint[];
}

/**
 * Where each month's revenue came from (stacked to the month's Total Due) and
 * how much of it was collected. The selected month is the last bar, drawn at
 * full strength.
 */
export function PayoutRevenueMixChart({ months }: Props) {
  const data = months.map((m) => {
    const date = new Date(m.year, m.month - 1, 1);
    return {
      key: `${m.year}-${m.month}`,
      label: format(date, "MMM"),
      title: format(date, "MMMM yyyy"),
      month: m.month,
      year: m.year,
      totalDue: m.totalDue,
      rebill: m.mix.rebill,
      new: m.mix.new,
      adAccount: m.mix.adAccount,
      collected: m.totalPaid,
    };
  });
  type Datum = (typeof data)[number];
  const hasData = months.some((m) => m.totalDue > 0 || m.totalPaid > 0);
  const last = data.length - 1;
  // Stack order rebill → new → ad account: whichever is the month's top
  // non-zero segment gets the rounded end; the selected month is full strength.
  const STACK = ["rebill", "new", "adAccount"] as const;
  const cellsFor = (series: (typeof STACK)[number]) =>
    data.map((d, i) => {
      const top = [...STACK].reverse().find((k) => d[k] > 0);
      return (
        <Cell
          key={d.key}
          fillOpacity={i === last ? 1 : 0.7}
          radius={(top === series ? [6, 6, 0, 0] : 0) as unknown as number}
        />
      );
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <CardTitle>Revenue Mix</CardTitle>
        </div>
        <CardDescription className="text-xs">Last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No payouts in the last 12 months.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatCents(v)}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const d = payload?.[0]?.payload as Datum | undefined;
                      return d ? `${d.title} · ${formatCents(d.totalDue)} due` : null;
                    }}
                    formatter={(value, name) => {
                      const key = name as SeriesKey;
                      return (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
                            style={{ "--color-bg": `var(--color-${key})` } as React.CSSProperties}
                          />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">{chartConfig[key]?.label}</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatCents(Number(value))}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* 2px card-colored stroke = the gap between stacked segments. */}
              <Bar dataKey="rebill" stackId="mix" fill="var(--color-rebill)" stroke="hsl(var(--card))" strokeWidth={2} maxBarSize={40} animationDuration={600}>
                {cellsFor("rebill")}
              </Bar>
              <Bar dataKey="new" stackId="mix" fill="var(--color-new)" stroke="hsl(var(--card))" strokeWidth={2} maxBarSize={40} animationDuration={600}>
                {cellsFor("new")}
              </Bar>
              <Bar
                dataKey="adAccount"
                stackId="mix"
                fill="var(--color-adAccount)"
                stroke="hsl(var(--card))"
                strokeWidth={2}
                maxBarSize={40} animationDuration={600}
              >
                {cellsFor("adAccount")}
              </Bar>
              <Line
                dataKey="collected"
                type="monotone"
                stroke="var(--color-collected)"
                strokeWidth={2}
                animationDuration={600}
                dot={{ r: 3, fill: "var(--color-collected)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                activeDot={{ r: 4.5, fill: "var(--color-collected)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
