"use client";

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatAxisValue, formatValue, toNumber } from "@/lib/analyst/format";
import type { DisplayChartInput } from "@/types/chat";

const SERIES = 5;
const colorVar = (i: number) => `var(--color-s${i % SERIES})`;

function prettyKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown> & { fill?: string };
}

function ValueTooltip({
  active,
  payload,
  label,
  format,
  currency,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format: DisplayChartInput["valueFormat"];
  currency?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-32 gap-1.5 rounded-xl bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      {label !== undefined && label !== "" && <div className="font-medium">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.payload?.fill ?? entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">
            {formatValue(entry.value, format ?? "number", currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SeriesLegend({ metrics }: { metrics: string[] }) {
  if (metrics.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
      {metrics.map((m, i) => (
        <span key={m} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: `hsl(var(--chart-${(i % SERIES) + 1}))` }} />
          {prettyKey(m)}
        </span>
      ))}
    </div>
  );
}

/** Memoized: a drawn chart doesn't re-render while the rest of the reply streams. */
export const InlineChart = memo(function InlineChart({ input }: { input: DisplayChartInput }) {
  const { type, title, metrics = [], xAxisKey = "name", valueFormat, currency } = input;

  // Numbers only — the model sometimes sends "$1,234" or "12%".
  const data = useMemo(
    () =>
      (input.data ?? []).map((item) => {
        const cleaned: Record<string, unknown> = { ...item };
        for (const key of metrics) cleaned[key] = toNumber(item[key]) ?? 0;
        if (cleaned[xAxisKey] === undefined || cleaned[xAxisKey] === null) cleaned[xAxisKey] = "";
        else cleaned[xAxisKey] = String(cleaned[xAxisKey]);
        return cleaned;
      }),
    [input.data, metrics, xAxisKey]
  );

  const config = useMemo<ChartConfig>(() => {
    const c: ChartConfig = {};
    for (let i = 0; i < SERIES; i++) c[`s${i}`] = { label: prettyKey(metrics[i] ?? ""), color: `hsl(var(--chart-${i + 1}))` };
    return c;
  }, [metrics]);

  if (data.length === 0 || metrics.length === 0) {
    return (
      <Card className="p-4 text-center text-xs text-muted-foreground shadow-none">No data available for this chart.</Card>
    );
  }

  const axisTick = { fontSize: 11 };
  const fmt = (v: unknown) => formatAxisValue(v, valueFormat, currency);
  const longestLabel = Math.max(...data.map((d) => String(d[xAxisKey]).length));
  const horizontalBars = type === "bar" && (data.length > 6 || longestLabel > 14);
  const barHeight = horizontalBars ? Math.min(560, Math.max(220, data.length * 30 * Math.max(1, metrics.length * 0.6) + 40)) : 260;
  const pie = type === "pie" || type === "donut";
  const pieKey = metrics[0];
  const pieTotal = pie ? data.reduce((s, d) => s + (Number(d[pieKey]) || 0), 0) : 0;

  return (
    <Card data-print-chart="" className="min-w-0 p-4 shadow-none">
      {title && <p className="mb-3 text-sm font-medium tracking-tight">{title}</p>}

      {type === "line" && (
        <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={xAxisKey} tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
            <ChartTooltip content={<ValueTooltip format={valueFormat} currency={currency} />} />
            {metrics.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={prettyKey(key)}
                stroke={colorVar(i)}
                strokeWidth={2}
                dot={data.length <= 31 ? { r: 2.5, fill: colorVar(i) } : false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}

      {type === "bar" && (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: barHeight }}>
          <BarChart
            data={data}
            layout={horizontalBars ? "vertical" : "horizontal"}
            margin={{ top: 16, right: horizontalBars ? 48 : 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={!horizontalBars} vertical={horizontalBars} strokeDasharray="3 3" />
            {horizontalBars ? (
              <>
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmt} />
                <YAxis
                  type="category"
                  dataKey={xAxisKey}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={Math.min(160, Math.max(72, longestLabel * 6.5))}
                  tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)}
                />
              </>
            ) : (
              <>
                <XAxis dataKey={xAxisKey} tick={axisTick} tickLine={false} axisLine={false} interval={0} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
              </>
            )}
            <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ValueTooltip format={valueFormat} currency={currency} />} />
            {metrics.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={prettyKey(key)}
                fill={colorVar(i)}
                radius={horizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={horizontalBars ? 22 : 48}
              >
                {data.length <= 12 && metrics.length <= 2 && (
                  <LabelList
                    dataKey={key}
                    position={horizontalBars ? "right" : "top"}
                    formatter={(v: number) => fmt(v)}
                    className="fill-muted-foreground"
                    style={{ fontSize: 10, fontWeight: 500 }}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      )}

      {pie && (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <ChartContainer config={config} className="aspect-square h-[220px] shrink-0">
            <PieChart>
              <ChartTooltip content={<ValueTooltip format={valueFormat} currency={currency} />} />
              <Pie
                data={data}
                dataKey={pieKey}
                nameKey={xAxisKey}
                innerRadius={type === "donut" ? 56 : 0}
                outerRadius={96}
                paddingAngle={data.length > 1 ? 1.5 : 0}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colorVar(i)} fillOpacity={i < SERIES ? 1 : 0.55} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="w-full min-w-0 space-y-1.5 text-xs">
            {data.map((d, i) => {
              const value = Number(d[pieKey]) || 0;
              return (
                <li key={i} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn("size-2.5 shrink-0 rounded-[2px]", i >= SERIES && "opacity-55")}
                    style={{ backgroundColor: `hsl(var(--chart-${(i % SERIES) + 1}))` }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={String(d[xAxisKey])}>
                    {String(d[xAxisKey]) || "—"}
                  </span>
                  <span className="tabular-nums font-medium">{formatValue(value, valueFormat ?? "number", currency)}</span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">
                    {pieTotal > 0 ? `${Math.round((value / pieTotal) * 100)}%` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!pie && <SeriesLegend metrics={metrics} />}
    </Card>
  );
});
