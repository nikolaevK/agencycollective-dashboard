"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { BarChart3 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

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

const chartConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

export function TeamOutputChart({ closerBreakdowns }: TeamOutputChartProps) {
  const sorted = [...closerBreakdowns]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const chartHeight = Math.min(Math.max(sorted.length * 44, 200), 400);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <CardTitle>Team Output</CardTitle>
      </CardHeader>

      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No closer data available yet.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto w-full"
            style={{ height: chartHeight }}
          >
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatCents(v)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="displayName"
                // First name only: recharts wraps long names mid-word in a
                // fixed-width axis. The tooltip shows the full name.
                tickFormatter={(v: string) => v.split(" ")[0]}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatCents(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="revenue"
                fill="var(--color-revenue)"
                radius={[0, 6, 6, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
