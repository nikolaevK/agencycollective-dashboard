"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "./format";

// The closed / paid pair used across the dashboard: billed = chart-1,
// collected = chart-2.
const chartConfig = {
  billed: { label: "Billed", color: "hsl(var(--chart-1))" },
  collected: { label: "Collected", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;
type SeriesKey = keyof typeof chartConfig;

/**
 * One client's payouts per month (Payout DB): what was billed (amount due)
 * next to what was collected (amount paid), plus the window's totals.
 */
export function PaymentHistoryChart({
  months,
  billed,
  collected,
}: {
  /** "yyyy-mm", oldest first. */
  months: string[];
  billed: number[];
  collected: number[];
}) {
  const data = useMemo(
    () =>
      months.map((ym, i) => ({
        key: ym,
        label: format(parseISO(`${ym}-01`), "MMM"),
        title: format(parseISO(`${ym}-01`), "MMMM yyyy"),
        billed: billed[i] ?? 0,
        collected: collected[i] ?? 0,
      })),
    [months, billed, collected]
  );
  type Datum = (typeof data)[number];
  const totalBilled = billed.reduce((s, v) => s + v, 0);
  const totalCollected = collected.reduce((s, v) => s + v, 0);
  const billedMonths = billed.filter((v) => v > 0).length;

  if (totalBilled === 0 && totalCollected === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No payouts in the last 12 months.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-4">
        <div className="min-w-0">
          <dt className="truncate text-xs text-muted-foreground">Billed</dt>
          <dd className="truncate text-lg font-semibold tracking-tight tabular-nums">{formatMoney(totalBilled)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-xs text-muted-foreground">Collected</dt>
          <dd className="truncate text-lg font-semibold tracking-tight tabular-nums">{formatMoney(totalCollected)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-xs text-muted-foreground">Avg per billed month</dt>
          <dd className="truncate text-lg font-semibold tracking-tight tabular-nums">
            {formatMoney(billedMonths > 0 ? totalBilled / billedMonths : 0)}
          </dd>
        </div>
      </dl>
      <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => formatMoney(v)} tickLine={false} axisLine={false} width={72} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => (payload?.[0]?.payload as Datum | undefined)?.title ?? null}
                formatter={(value, name) => {
                  const key = name as SeriesKey;
                  return (
                    <>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
                        style={{ "--color-bg": `var(--color-${key})` } as React.CSSProperties}
                      />
                      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                        <span className="text-muted-foreground">{chartConfig[key]?.label}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                      </div>
                    </>
                  );
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="billed" fill="var(--color-billed)" radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={600} />
          <Bar dataKey="collected" fill="var(--color-collected)" radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={600} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
