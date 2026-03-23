"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { BarChart3 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";

interface CloserPerformanceChartProps {
  deals: DealPublic[];
}

interface ChartDataPoint {
  date: string;
  label: string;
  total: number;
}

export function CloserPerformanceChart({ deals }: CloserPerformanceChartProps) {
  const chartData = useMemo(() => {
    if (deals.length === 0) return [];

    // Group deals by closing date or created date, take last 7 distinct days with deals
    const byDate = new Map<string, number>();

    for (const deal of deals) {
      const dateStr = deal.closingDate || deal.createdAt.split("T")[0];
      const current = byDate.get(dateStr) ?? 0;
      byDate.set(dateStr, current + deal.dealValue);
    }

    // Sort dates ascending and take last 7
    const sorted = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7);

    return sorted.map(([date, total]): ChartDataPoint => ({
      date,
      label: format(parseISO(date), "MMM d"),
      total,
    }));
  }, [deals]);

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-6">
        Performance Trends
      </h3>

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mb-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No deal data to chart yet.
          </p>
        </div>
      ) : (
        <div style={{ width: "100%", height: 250, overflow: "hidden" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
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
              />
              <YAxis
                tickFormatter={(v: number) => formatCents(v)}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as ChartDataPoint;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                      <p className="text-xs font-medium text-muted-foreground">
                        {format(parseISO(item.date), "MMM d, yyyy")}
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {formatCents(item.total)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="total"
                fill="hsl(263, 70%, 52%)"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
