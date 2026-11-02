import type { ComponentProps } from "react";
import { format, parseISO } from "date-fns";
import type { MetricSparkline } from "@/components/shared/MetricSparkline";
import type { OverviewTrends, SeriesBucket } from "@/lib/metricSeries";

type CardTrend = Omit<ComponentProps<typeof MetricSparkline>, "label">;

/** Time-frame cards: the value accumulated through each bucket, so the line
 *  ends at the card's number; the previous period runs dashed behind it. */
export function windowTrend(
  w: OverviewTrends["window"] | undefined,
  values: (buckets: SeriesBucket[]) => (number | null)[],
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
