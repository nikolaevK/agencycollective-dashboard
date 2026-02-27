"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface BarDataItem {
  name: string;
  value: number;
}

interface BarComparisonChartProps {
  data: BarDataItem[];
  metric: "spend" | "impressions" | "clicks" | "conversions";
  currency?: string;
  height?: number;
  color?: string;
}

const METRIC_FORMATTERS: Record<string, (v: number, currency?: string) => string> = {
  spend: (v, c) => formatCurrency(v, c || "USD"),
  impressions: (v) => formatNumber(v),
  clicks: (v) => formatNumber(v),
  conversions: (v) => formatNumber(v),
};

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#f97316", "#06b6d4", "#84cc16",
];

export function BarComparisonChart({
  data,
  metric,
  currency = "USD",
  height = 300,
  color,
}: BarComparisonChartProps) {
  const formatter = METRIC_FORMATTERS[metric] ?? formatNumber;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatter(v, currency)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip
          formatter={(value: number) => [formatter(value, currency), metric]}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={color || COLORS[index % COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
