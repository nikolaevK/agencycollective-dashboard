"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";
import {
  formatCents,
  CHART_CLOSED_COLOR,
  CHART_PAID_COLOR,
} from "@/components/closers/types";
import { format, parseISO } from "date-fns";
import type { TeamMonthlyTrendPoint } from "@/lib/deals";

interface Props {
  data: TeamMonthlyTrendPoint[];
}

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
export function TeamTrendChart({ data }: Props) {
  const hasData = data.some((p) => p.closedRevenue > 0 || p.paidRevenue > 0);

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-violet-500" />
          <h3 className="text-base font-semibold text-foreground">Revenue Trend</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">Last 12 months</span>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No revenue recorded in the last 12 months.
        </p>
      ) : (
        <div style={{ width: "100%", height: 260, overflow: "hidden" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatCents(v)}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as TeamMonthlyTrendPoint;
                  return (
                    <div className="rounded-lg border border-border/50 dark:border-white/[0.06] bg-card px-3 py-2 shadow-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {format(parseISO(`${p.month}-01`), "MMMM yyyy")}
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{formatCents(p.closedRevenue)}</span>{" "}
                        closed · {p.closedCount} deal{p.closedCount === 1 ? "" : "s"}
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{formatCents(p.paidRevenue)}</span> paid
                      </p>
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
                dataKey="closedRevenue"
                name="Closed revenue"
                fill={CHART_CLOSED_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="paidRevenue"
                name="Paid revenue"
                fill={CHART_PAID_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
