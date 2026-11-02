"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ListChecks, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/components/users/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Team hub charts (recharts — load these lazily). The same marks as the rest
// of the dashboard: re-bill = chart-4 (Payout Tracker / Client Directory),
// done = chart-2, goals and "created" stay neutral.
// ---------------------------------------------------------------------------

const monthDate = (ym: string) => parseISO(`${ym}-01`);

/** One tooltip row: color swatch, label, value. */
function TooltipRow({ colorVar, label, value }: { colorVar: string; label: React.ReactNode; value: string }) {
  return (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
        style={{ "--color-bg": `var(--color-${colorVar})` } as React.CSSProperties}
      />
      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
      </div>
    </>
  );
}

function ChartState({ failed, height, failText }: { failed?: boolean; height: number; failText: string }) {
  return failed ? (
    <p className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      {failText}
    </p>
  ) : (
    <Skeleton className="w-full rounded-2xl" style={{ height }} />
  );
}

// ---------------------------------------------------------------------------
// Re-billed per month vs the monthly goal
// ---------------------------------------------------------------------------

const rebillConfig = {
  rebilled: { label: "Re-billed", color: "hsl(var(--chart-4))" },
  goal: { label: "Goal", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

export function RebillGoalChart({
  months,
  rebilled,
  goals,
  failed,
  description,
  className,
  height = 260,
}: {
  months?: string[];
  rebilled?: number[];
  /** Per-month goal — a single member's only (goals overlap across members,
   *  so they don't add up to a team goal). Omit to draw re-bills alone. */
  goals?: number[];
  failed?: boolean;
  /** Whose re-bills these are ("REBILL payouts · whole book"). */
  description: string;
  className?: string;
  height?: number;
}) {
  const data = useMemo(
    () =>
      months && rebilled
        ? months.map((ym, i) => ({
            key: ym,
            label: format(monthDate(ym), "MMM"),
            title: format(monthDate(ym), "MMMM yyyy"),
            rebilled: rebilled[i] ?? 0,
            goal: goals && goals[i] > 0 ? goals[i] : null,
          }))
        : null,
    [months, rebilled, goals]
  );
  type Datum = NonNullable<typeof data>[number];
  const hasGoal = data?.some((d) => d.goal != null) ?? false;
  const hasData = data?.some((d) => d.rebilled > 0 || d.goal != null) ?? false;
  const last = (data?.length ?? 0) - 1;
  const current = data?.[last];

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RefreshCcw className="size-4 text-muted-foreground" />
            <CardTitle>{hasGoal ? "Re-billed vs Goal" : "Re-billed per Month"}</CardTitle>
          </div>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        {current && (
          <div className="text-left sm:text-right">
            <p className="text-lg font-semibold tabular-nums">{formatMoney(current.rebilled)}</p>
            <p className="text-xs text-muted-foreground">
              {current.title}
              {current.goal != null && ` · ${Math.round((current.rebilled / current.goal) * 100)}% of ${formatMoney(current.goal)}`}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {!data ? (
          <ChartState failed={failed} height={height} failText="Couldn't load the re-bill history." />
        ) : !hasData ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No re-bill payouts in the last 12 months.
          </p>
        ) : (
          <ChartContainer config={rebillConfig} className="aspect-auto w-full" style={{ height }}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => formatMoney(v)} tickLine={false} axisLine={false} width={72} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const d = payload?.[0]?.payload as Datum | undefined;
                      if (!d) return null;
                      return d.goal != null
                        ? `${d.title} · ${Math.round((d.rebilled / d.goal) * 100)}% of goal`
                        : d.title;
                    }}
                    formatter={(value, name) => (
                      <TooltipRow
                        colorVar={String(name)}
                        label={rebillConfig[name as keyof typeof rebillConfig]?.label}
                        value={formatMoney(Number(value))}
                      />
                    )}
                  />
                }
              />
              {hasGoal && <ChartLegend content={<ChartLegendContent />} />}
              <Bar dataKey="rebilled" fill="var(--color-rebilled)" radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={600}>
                {data.map((d, i) => (
                  <Cell key={d.key} fillOpacity={i === last ? 1 : 0.7} />
                ))}
              </Bar>
              {hasGoal && (
                <Line
                  dataKey="goal"
                  // Steps between bars, so each bar sits under its own month's goal.
                  type="step"
                  stroke="var(--color-goal)"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 3.5, fill: "var(--color-goal)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  connectNulls={false}
                  animationDuration={600}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tasks created vs completed per week
// ---------------------------------------------------------------------------

const taskConfig = {
  created: { label: "Created", color: "hsl(var(--muted-foreground))" },
  completed: { label: "Completed", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

export function TaskThroughputChart({
  weeks,
  created,
  completed,
  failed,
  description,
  className,
  height = 240,
}: {
  weeks?: string[];
  created?: number[];
  completed?: number[];
  failed?: boolean;
  description: string;
  className?: string;
  height?: number;
}) {
  const data = useMemo(
    () =>
      weeks && created && completed
        ? weeks.map((ymd, i) => ({
            key: ymd,
            label: format(parseISO(ymd), "MMM d"),
            title: `Week of ${format(parseISO(ymd), "MMM d")}`,
            created: created[i] ?? 0,
            completed: completed[i] ?? 0,
          }))
        : null,
    [weeks, created, completed]
  );
  type Datum = NonNullable<typeof data>[number];
  const hasData = data?.some((d) => d.created > 0 || d.completed > 0) ?? false;
  const totalDone = data?.reduce((s, d) => s + d.completed, 0) ?? 0;
  const thisWeek = data?.[data.length - 1];

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 text-muted-foreground" />
            <CardTitle>Task Throughput</CardTitle>
          </div>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        {thisWeek && (
          <div className="text-left sm:text-right">
            <p className="text-lg font-semibold tabular-nums">{thisWeek.completed} done</p>
            <p className="text-xs text-muted-foreground">
              This week · {totalDone} in 12 weeks
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {!data ? (
          <ChartState failed={failed} height={height} failText="Couldn't load the task history." />
        ) : !hasData ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No tasks created or completed in the last 12 weeks.</p>
        ) : (
          <ChartContainer config={taskConfig} className="aspect-auto w-full" style={{ height }}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => (payload?.[0]?.payload as Datum | undefined)?.title ?? null}
                    formatter={(value, name) => (
                      <TooltipRow
                        colorVar={String(name)}
                        label={taskConfig[name as keyof typeof taskConfig]?.label}
                        value={String(value)}
                      />
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="created" fill="var(--color-created)" fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={600} />
              <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={600} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
