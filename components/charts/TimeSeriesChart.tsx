"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { TimeSeriesDataPoint } from "@/types/dashboard";

type MetricKey =
  | "spend" | "roas" | "conversions" | "conversionValue" | "costPerPurchase"
  | "impressions" | "reach" | "clicks" | "ctr" | "cpc";

interface MetricConfig {
  label: string;
  color: string;
  formatter: (v: number) => string;
  primary?: boolean;
}

const METRICS: Record<MetricKey, MetricConfig> = {
  // Primary — matches KpiGrid order
  spend:           { label: "Amount Spent",    color: "#7c3aed", formatter: (v) => `$${v.toFixed(2)}`,   primary: true },
  roas:            { label: "ROAS",            color: "#2563eb", formatter: (v) => `${v.toFixed(2)}x`,   primary: true },
  conversions:     { label: "Purchases",       color: "#059669", formatter: (v) => v.toLocaleString(),   primary: true },
  conversionValue: { label: "Purchase Value",  color: "#0891b2", formatter: (v) => `$${v.toFixed(2)}`,   primary: true },
  costPerPurchase: { label: "Cost/Purchase",   color: "#d97706", formatter: (v) => `$${v.toFixed(2)}`,   primary: true },
  // Secondary
  impressions:     { label: "Impressions",     color: "#8b5cf6", formatter: (v) => v.toLocaleString() },
  reach:           { label: "Reach",           color: "#ec4899", formatter: (v) => v.toLocaleString() },
  clicks:          { label: "Clicks",          color: "#f59e0b", formatter: (v) => v.toLocaleString() },
  ctr:             { label: "CTR (%)",         color: "#10b981", formatter: (v) => `${v.toFixed(2)}%` },
  cpc:             { label: "CPC ($)",         color: "#f97316", formatter: (v) => `$${v.toFixed(2)}` },
};

interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  height?: number;
  defaultMetrics?: MetricKey[];
}

export function TimeSeriesChart({
  data,
  height = 300,
  defaultMetrics = ["spend", "roas", "conversions", "conversionValue", "costPerPurchase"],
}: TimeSeriesChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(defaultMetrics)
  );

  function toggleMetric(metric: MetricKey) {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) {
        if (next.size > 1) next.delete(metric);
      } else {
        next.add(metric);
      }
      return next;
    });
  }

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Metric toggles — primary group then secondary */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.entries(METRICS) as [MetricKey, MetricConfig][]).map(([key, config], i, arr) => {
          const prevPrimary = i > 0 && arr[i - 1][1].primary;
          const showDivider = !config.primary && prevPrimary;
          return (
            <span key={key} className="contents">
              {showDivider && (
                <span className="h-4 w-px bg-border mx-0.5 self-center" />
              )}
              <button
                onClick={() => toggleMetric(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  activeMetrics.has(key)
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:border-foreground/50"
                )}
                style={
                  activeMetrics.has(key)
                    ? { backgroundColor: config.color, borderColor: config.color }
                    : undefined
                }
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                {config.label}
              </button>
            </span>
          );
        })}
      </div>

      {/* Chart — explicit height wrapper prevents ResponsiveContainer from blowing out */}
      <div style={{ width: "100%", height, overflow: "hidden" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              labelFormatter={(label) => {
                try { return format(parseISO(label), "MMMM d, yyyy"); }
                catch { return label; }
              }}
              formatter={(value: number, name: string) => {
                const metric = Object.entries(METRICS).find(([, cfg]) => cfg.label === name);
                return [metric ? metric[1].formatter(value) : value, name];
              }}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            {(Object.entries(METRICS) as [MetricKey, MetricConfig][])
              .filter(([key]) => activeMetrics.has(key))
              .map(([key, config]) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={config.label}
                  stroke={config.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
