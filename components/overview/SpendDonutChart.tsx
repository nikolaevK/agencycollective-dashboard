"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { AccountSummary } from "@/types/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#f97316", "#06b6d4", "#84cc16",
];

interface SpendDonutChartProps {
  accounts?: AccountSummary[];
  isLoading?: boolean;
}

export function SpendDonutChart({ accounts, isLoading }: SpendDonutChartProps) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const data = accounts
    .filter((a) => a.insights.spend > 0)
    .sort((a, b) => b.insights.spend - a.insights.spend)
    .slice(0, 8) // top 8
    .map((a) => ({
      name: a.name.length > 20 ? a.name.slice(0, 20) + "…" : a.name,
      value: a.insights.spend,
      currency: a.currency,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No spend data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, _name, props) =>
            [formatCurrency(value, props.payload?.currency), "Spend"]
          }
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span className="text-xs">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
