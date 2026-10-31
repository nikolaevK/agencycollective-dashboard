"use client";

import { memo, useId, useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";

export interface SparkPoint {
  /** Readout label while this point is hovered ("Through Oct 12", "Mar 2026"). */
  label: string;
  value: number | null;
  /** The same position in the previous period (dashed comparison line). */
  previous?: number | null;
}

interface Props {
  points: SparkPoint[];
  /** Line + area color, e.g. "hsl(var(--chart-1))". */
  color: string;
  format: (value: number) => string;
  /** Readout when nothing is hovered: what the line spans ("Last 12 months"). */
  caption: string;
  /** Right-hand readout when there's no previous-period line ("Monthly"). */
  hint?: string;
  /** Accessible name of the chart. */
  label: string;
  /** A level to compare against (e.g. a forecast), drawn as a dashed line. */
  reference?: { value: number; label: string };
}

/**
 * Trend line for the bottom of a metric card: gradient-filled area with the
 * latest point highlighted, an optional dashed previous-period line, and a
 * hover readout above it (the card clips overflow, so no floating tooltip).
 * Bleeds to the card's edges — it must be the last child of CardContent
 * (in a flex-column CardContent it also sticks to the card's bottom).
 * Memoized: pass stable `points`/`format`/`reference` so parent re-renders
 * (e.g. typing in a page's search box) skip the chart.
 */
export const MetricSparkline = memo(function MetricSparkline({
  points,
  color,
  format,
  caption,
  hint,
  label,
  reference,
}: Props) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  const [active, setActive] = useState<number | null>(null);
  const hovered = active != null ? points[active] : undefined;
  const hasPrevious = points.some((p) => p.previous != null);
  let lastIndex = -1;
  points.forEach((p, i) => {
    if (p.value != null) lastIndex = i;
  });

  const config = {
    value: { label, color },
    previous: { label: "Previous period", color: "hsl(var(--muted-foreground))" },
  } satisfies ChartConfig;

  return (
    <div className="mt-auto pt-3">
      {/* Both sides truncate in narrow cards; the right (the value) shrinks last. */}
      <div className="flex h-4 items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
        <span className="min-w-0 truncate">{hovered ? hovered.label : caption}</span>
        {(hovered || hasPrevious || reference || hint) && (
          <span className="min-w-0 shrink-[0.25] truncate text-right">
            {hovered ? (
              <>
                <span className="font-medium text-foreground">
                  {hovered.value == null ? "—" : format(hovered.value)}
                </span>
                {hasPrevious && (
                  <> · prev {hovered.previous == null ? "—" : format(hovered.previous)}</>
                )}
              </>
            ) : hasPrevious || reference ? (
              <>
                <span
                  aria-hidden
                  className="mr-1 inline-block w-3 border-t border-dashed border-muted-foreground/70 align-middle"
                />
                {reference ? reference.label : "Previous period"}
              </>
            ) : (
              hint
            )}
          </span>
        )}
      </div>
      <ChartContainer
        config={config}
        role="img"
        aria-label={`${label} trend, ${caption}${
          lastIndex >= 0 ? `, latest ${format(points[lastIndex].value as number)}` : ""
        }`}
        className="-mx-4 -mb-4 mt-1 aspect-auto h-16 md:-mx-6 md:-mb-6"
      >
        <ComposedChart
          data={points}
          margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          onMouseMove={(state) =>
            setActive(typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : null)
          }
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis
            hide
            domain={[0, (max: number) => Math.max(max, reference?.value ?? 0) || 1]}
          />
          {reference && (
            <ReferenceLine
              y={reference.value}
              stroke="var(--color-previous)"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
              ifOverflow="extendDomain"
            />
          )}
          <ChartTooltip
            cursor={{ strokeDasharray: "2 2" }}
            content={() => null}
            isAnimationActive={false}
          />
          {hasPrevious && (
            <Line
              dataKey="previous"
              type="monotone"
              stroke="var(--color-previous)"
              strokeOpacity={0.5}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            connectNulls
            animationDuration={600}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === lastIndex && active == null ? (
                <circle
                  key="last"
                  cx={props.cx}
                  cy={props.cy}
                  r={3.5}
                  fill="var(--color-value)"
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 3.5, fill: "var(--color-value)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
});
