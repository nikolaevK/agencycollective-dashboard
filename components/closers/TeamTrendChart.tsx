"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { format, parseISO } from "date-fns";
import type { TeamMonthlyTrendPoint } from "@/lib/deals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface Props {
  data: TeamMonthlyTrendPoint[];
  /** Next to the "Last 12 months" note (e.g. a link to the Sales Overview). */
  action?: React.ReactNode;
}

const chartConfig = {
  // Theme chart pair (globals.css): closed = blue, paid = emerald.
  closedRevenue: { label: "Closed revenue", color: "hsl(var(--chart-1))" },
  paidRevenue: { label: "Paid revenue", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

function monthLabel(month: string): string {
  try {
    return format(parseISO(`${month}-01`), "MMM");
  } catch {
    return month;
  }
}

/**
 * Last-12-months closed vs paid revenue, team-wide. Fixed window on purpose:
 * the trend gives context while the metric cards track the selected frame.
 */
export function TeamTrendChart({ data, action }: Props) {
  const hasData = data.some((p) => p.closedRevenue > 0 || p.paidRevenue > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Revenue Trend</CardTitle>
        </div>
        <div className="flex items-center gap-3">
          <CardDescription className="text-xs">Last 12 months</CardDescription>
          {action}
        </div>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No revenue recorded in the last 12 months.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tickLine={false}
                axisLine={false}
              />
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
                      const p = payload?.[0]?.payload as TeamMonthlyTrendPoint | undefined;
                      return p ? format(parseISO(`${p.month}-01`), "MMMM yyyy") : null;
                    }}
                    formatter={(value, name, item) => {
                      const p = item.payload as TeamMonthlyTrendPoint;
                      const key = name as keyof typeof chartConfig;
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
                              {key === "closedRevenue" &&
                                ` · ${p.closedCount} deal${p.closedCount === 1 ? "" : "s"}`}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="closedRevenue"
                fill="var(--color-closedRevenue)"
                radius={[6, 6, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="paidRevenue"
                fill="var(--color-paidRevenue)"
                radius={[6, 6, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
