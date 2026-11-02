import type { ComponentProps } from "react";
import { format, parseISO } from "date-fns";
import type { MetricSparkline } from "@/components/shared/MetricSparkline";
import type { SeriesBucket, SeriesGranularity } from "@/lib/metricSeries";

export type CardTrend = Omit<ComponentProps<typeof MetricSparkline>, "label">;

/** Lifetime cards: one value per month over the last 12 months. */
export function monthlyTrend<B extends SeriesBucket>(
  buckets: B[] | null | undefined,
  pick: (b: B) => number | null,
  color: string,
  fmt: (v: number) => string
): CardTrend | undefined {
  if (!buckets || buckets.length < 2) return undefined;
  return {
    points: buckets.map((b) => ({ label: format(parseISO(b.start), "MMM yyyy"), value: pick(b) })),
    color,
    format: fmt,
    caption: "Last 12 months",
    hint: "Per month",
  };
}

/** Time-frame cards: the value accumulated through each bucket, so the line
 *  ends at the card's number; the previous period runs dashed behind it.
 *  Generic over the bucket so setter buckets (+ appointments) fit too. */
export function windowTrend<B extends SeriesBucket>(
  w: { granularity: SeriesGranularity; current: B[]; previous: B[] | null } | null | undefined,
  values: (buckets: B[]) => (number | null)[],
  color: string,
  fmt: (v: number) => string
): CardTrend | undefined {
  if (!w || w.current.length < 2) return undefined;
  const current = values(w.current);
  const previous = w.previous ? values(w.previous) : null;
  // A longer previous period (Jan's 31 days vs Feb's 28) has buckets past the
  // current window's end: the last aligned point carries its full total, so
  // the dashed line ends where the Δ chip's baseline is.
  if (previous && previous.length > current.length) {
    previous[current.length - 1] = previous[previous.length - 1];
  }
  const day = (ymd: string) => format(parseISO(ymd), w.granularity === "month" ? "MMM yyyy" : "MMM d");
  return {
    points: w.current.map((b, i) => ({
      label: `Through ${day(b.end)}`,
      value: current[i],
      previous: previous ? (previous[i] ?? null) : undefined,
    })),
    color,
    format: fmt,
    caption: `${day(w.current[0].start)} – ${day(w.current[w.current.length - 1].end)}`,
    hint: "Cumulative",
  };
}
