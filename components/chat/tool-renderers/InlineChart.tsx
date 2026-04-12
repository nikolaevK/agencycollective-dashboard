"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import type { DisplayChartInput } from "@/types/chat";

const COLORS = [
  "#7c3aed", "#3b82f6", "#059669", "#0891b2",
  "#d97706", "#ec4899", "#f59e0b", "#10b981",
];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {label && <p className="text-xs font-medium text-foreground mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

function formatLabel(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v % 1 !== 0) return v.toFixed(2);
  return v.toLocaleString();
}

function RenderLineChart({ data, metrics, xAxisKey }: { data: Record<string, unknown>[]; metrics: string[]; xAxisKey: string }) {
  // Show dot labels only when few data points (otherwise too cluttered)
  const showLabels = data.length <= 12;
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 15, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
        <Tooltip content={<ChartTooltip />} />
        {metrics.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        {metrics.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
            activeDot={{ r: 4 }}
          >
            {showLabels && (
              <LabelList
                dataKey={key}
                position="top"
                formatter={(v: number) => formatLabel(v)}
                style={{ fontSize: 8, fill: "#68788f", fontWeight: 600 }}
              />
            )}
          </Line>
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RenderBarChart({ data, metrics, xAxisKey }: { data: Record<string, unknown>[]; metrics: string[]; xAxisKey: string }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 15, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={data.length > 5 ? -45 : 0}
          textAnchor={data.length > 5 ? "end" : "middle"}
          height={data.length > 5 ? 80 : 30}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
        <Tooltip content={<ChartTooltip />} />
        {metrics.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        {metrics.map((key, i) => (
          <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey={key}
              position="top"
              formatter={(v: number) => formatLabel(v)}
              style={{ fontSize: 9, fill: "#68788f", fontWeight: 600 }}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function RenderPieChart({ data, metrics, isDoughnut }: { data: Record<string, unknown>[]; metrics: string[]; isDoughnut: boolean }) {
  const dataKey = metrics[0] ?? "value";
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={isDoughnut ? 50 : 0}
          outerRadius={90}
          paddingAngle={2}
          label={({ name, value, percent }) =>
            `${name}: ${formatLabel(value)} (${(percent * 100).toFixed(0)}%)`
          }
          labelLine
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function InlineChart({ input }: { input: DisplayChartInput }) {
  const { type, title, data, metrics, xAxisKey = "name" } = input;

  if (!data || data.length === 0 || !metrics || metrics.length === 0) {
    return (
      <div className="my-3 p-4 bg-muted/30 rounded-xl border border-border/50 text-center text-xs text-muted-foreground">
        No data available for chart
      </div>
    );
  }

  // Sanitize data: ensure numeric values are actual numbers
  const sanitizedData = data.map((item) => {
    const cleaned: Record<string, unknown> = { ...item };
    for (const key of metrics) {
      const val = cleaned[key];
      if (typeof val === "string") cleaned[key] = parseFloat(val) || 0;
      if (val === null || val === undefined) cleaned[key] = 0;
    }
    return cleaned;
  });

  return (
    <div className="my-3">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-2">{title}</p>
      )}
      <div
        data-print-chart=""
        className="rounded-xl border border-border/50 bg-card p-3"
        style={{ width: "100%", height: 280, overflow: "hidden" }}
      >
        {type === "line" && <RenderLineChart data={sanitizedData} metrics={metrics} xAxisKey={xAxisKey} />}
        {type === "bar" && <RenderBarChart data={sanitizedData} metrics={metrics} xAxisKey={xAxisKey} />}
        {(type === "pie" || type === "donut") && (
          <RenderPieChart data={sanitizedData} metrics={metrics} isDoughnut={type === "donut"} />
        )}
      </div>
    </div>
  );
}
