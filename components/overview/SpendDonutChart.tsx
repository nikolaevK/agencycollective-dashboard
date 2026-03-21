"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import type { AccountSummary } from "@/types/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
const COLORS = [
  "hsl(var(--primary))",       // primary purple
  "#b28cff",                   // primary-container
  "#9eaec7",                   // outline-variant / secondary
  "#6411d5",                   // primary-dim
  "#ff8eac",                   // tertiary-fixed / pink
  "#06b6d4",                   // cyan
  "#f59e0b",                   // amber
  "#10b981",                   // emerald
];

interface SpendDonutChartProps {
  accounts?: AccountSummary[];
  isLoading?: boolean;
}

export function SpendDonutChart({ accounts, isLoading }: SpendDonutChartProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col lg:flex-row items-center justify-around gap-8">
        <Skeleton className="h-56 w-56 rounded-full shrink-0" />
        <div className="flex-1 max-w-xs space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const data = accounts
    .filter((a) => a.insights.spend > 0)
    .sort((a, b) => b.insights.spend - a.insights.spend)
    .slice(0, 8)
    .map((a) => ({
      name: a.name.length > 22 ? a.name.slice(0, 22) + "\u2026" : a.name,
      value: a.insights.spend,
      currency: a.currency,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No spend data
      </div>
    );
  }

  const totalSpend = data.reduce((sum, d) => sum + d.value, 0);
  const primaryCurrency = data[0]?.currency ?? "USD";

  return (
    <div className="flex flex-col lg:flex-row items-center justify-around gap-8">
      {/* Donut chart with center value */}
      <div className="max-w-[240px] mx-auto lg:max-w-none lg:mx-0 lg:shrink-0 relative hover:scale-105 transition-transform duration-500" style={{ width: 224, height: 224 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              paddingAngle={1}
              dataKey="value"
              strokeWidth={0}
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
                border: "none",
                borderRadius: "12px",
                fontSize: "12px",
                boxShadow: "0 4px 24px rgba(32, 48, 68, 0.12)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center value overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
            <span className="lg:hidden">Total</span>
            <span className="hidden lg:inline">Total Portfolio</span>
          </span>
          <span className="text-lg font-black text-foreground">
            {formatCurrencyCompact(totalSpend, primaryCurrency)}
          </span>
        </div>
      </div>

      {/* Mobile / tablet legend — 2-column grid, dot+name only */}
      <div className="grid grid-cols-2 gap-4 mt-8 lg:hidden">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-3 h-3 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-sm font-medium text-foreground truncate">
              {item.name}
            </span>
          </div>
        ))}
      </div>

      {/* Desktop legend — vertical list with amounts */}
      <div className="hidden lg:flex lg:flex-col flex-1 max-w-xs space-y-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between group cursor-default">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {item.name}
              </span>
            </div>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {formatCurrency(item.value, item.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
