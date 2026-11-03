"use client";

// Loaded on demand by RevenueProjection (next/dynamic) — recharts stays out
// of the page's first load. Named imports only (optimizePackageImports).
import type { CSSProperties } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtMoney, fullMoney } from "./format";

export interface RevenueDatum {
  label: string;
  title: string;
  retainer: number;
  newAccounts: number;
  perf: number;
  profit: number;
}
export interface BookDatum {
  label: string;
  title: string;
  book: number;
}
export interface ScenarioDatum {
  label: string;
  title: string;
  s80: number;
  s65: number;
  s7: number;
}

// Three revenue streams = chart-1..3; net profit is a neutral line (a
// different mark, not a 4th hue) — the Client Directory's "collected" pattern.
const revenueConfig = {
  retainer: { label: "Retainer", color: "hsl(var(--chart-1))" },
  newAccounts: { label: "New accounts", color: "hsl(var(--chart-2))" },
  perf: { label: "Performance fees", color: "hsl(var(--chart-3))" },
  profit: { label: "Net profit", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

const bookConfig = {
  book: { label: "Active book", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const scenarioConfig = {
  s80: { label: "80% retention", color: "hsl(var(--chart-2))" },
  s65: { label: "65% baseline", color: "hsl(var(--chart-1))" },
  s7: { label: "~7% (today)", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig;

/** Tooltip row: series swatch, label, value (shown even when it's 0). */
function tooltipRow(config: ChartConfig, format: (v: number) => string) {
  function Row(value: unknown, name: unknown) {
    const key = String(name);
    return (
      <>
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
          style={{ "--color-bg": `var(--color-${key})` } as CSSProperties}
        />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{format(Number(value ?? 0))}</span>
        </div>
      </>
    );
  }
  return Row;
}

/** "Jan 2027" from the hovered row. */
function titleOf(_: unknown, payload: readonly { payload?: { title?: string } }[] | undefined) {
  return payload?.[0]?.payload?.title ?? null;
}

export function RevenueMixChart({ data }: { data: RevenueDatum[] }) {
  return (
    <ChartContainer config={revenueConfig} className="aspect-auto h-[300px] w-full">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtMoney} tickLine={false} axisLine={false} width={56} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={titleOf} formatter={tooltipRow(revenueConfig, fullMoney)} />}
        />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1 [&>div]:whitespace-nowrap" />} />
        <Bar dataKey="retainer" stackId="r" fill="var(--color-retainer)" maxBarSize={48} />
        <Bar dataKey="newAccounts" stackId="r" fill="var(--color-newAccounts)" maxBarSize={48} />
        <Bar dataKey="perf" stackId="r" fill="var(--color-perf)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--color-profit)" }} />
      </ComposedChart>
    </ChartContainer>
  );
}

export function BookChart({ data }: { data: BookDatum[] }) {
  return (
    <ChartContainer config={bookConfig} className="aspect-auto h-[280px] w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={titleOf} formatter={tooltipRow(bookConfig, (v) => `${v}`)} />}
        />
        <Line type="monotone" dataKey="book" stroke="var(--color-book)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-book)" }} />
      </LineChart>
    </ChartContainer>
  );
}

export function ScenarioChart({ data }: { data: ScenarioDatum[] }) {
  return (
    <ChartContainer config={scenarioConfig} className="aspect-auto h-[280px] w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtMoney} tickLine={false} axisLine={false} width={56} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={titleOf} formatter={tooltipRow(scenarioConfig, fullMoney)} />}
        />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1 [&>div]:whitespace-nowrap" />} />
        <Line type="monotone" dataKey="s80" stroke="var(--color-s80)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="s65" stroke="var(--color-s65)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="s7" stroke="var(--color-s7)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
