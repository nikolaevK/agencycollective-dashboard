"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
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
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const data = accounts
    .filter((a) => a.insights.spend > 0)
    .sort((a, b) => b.insights.spend - a.insights.spend)
    .slice(0, 8)
    .map((a) => ({
      name: a.name.length > 22 ? a.name.slice(0, 22) + "…" : a.name,
      value: a.insights.spend,
      currency: a.currency,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No spend data
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pie — fixed height container so ResponsiveContainer works reliably */}
      <div style={{ width: "100%", height: 200, overflow: "hidden" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name, props) =>
                [formatCurrency(value, props.payload?.currency), "Spend"]
              }
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend — HTML, no Recharts magic */}
      <div className="flex flex-col gap-1.5">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="truncate text-muted-foreground">{item.name}</span>
            </div>
            <span className="shrink-0 font-medium tabular-nums">
              {formatCurrency(item.value, item.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
