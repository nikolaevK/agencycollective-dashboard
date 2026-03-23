"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { formatCents } from "@/components/closers/types";

interface CloserBreakdown {
  closerId: string;
  displayName: string;
  avatarPath: string | null;
  revenue: number;
  closedCount: number;
  totalCount: number;
  commissionRate: number;
}

interface TeamOutputChartProps {
  closerBreakdowns: CloserBreakdown[];
}

interface TooltipPayloadItem {
  value: number;
  payload: { displayName: string; revenue: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];

  return (
    <div className="rounded-lg border border-border/50 dark:border-white/[0.06] bg-card px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-foreground">
        {entry.payload.displayName}
      </p>
      <p className="text-sm text-muted-foreground">
        {formatCents(entry.value)}
      </p>
    </div>
  );
}

export function TeamOutputChart({ closerBreakdowns }: TeamOutputChartProps) {
  const sorted = [...closerBreakdowns]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const chartHeight = Math.min(Math.max(sorted.length * 44, 200), 400);

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 className="h-5 w-5 text-violet-500" />
        <h3 className="text-base font-semibold text-foreground">Team Output</h3>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No closer data available yet.
        </p>
      ) : (
        <div style={{ width: "100%", height: chartHeight, overflow: "hidden" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatCents(v)}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="displayName"
                tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              />
              <Bar
                dataKey="revenue"
                fill="hsl(263, 70%, 52%)"
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
