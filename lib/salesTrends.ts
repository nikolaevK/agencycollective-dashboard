import { getDealDayRows, previousWindowBounds } from "./deals";
import { getAttendanceDayRows } from "./eventAttendance";
import { getSetterAppointmentDayRows } from "./setterStats";
import { businessTodayYmd } from "./businessTime";
import {
  bucketCounts,
  bucketRanges,
  bucketize,
  lastMonthsRanges,
  seriesGranularity,
  type OverviewTrends,
  type SeriesGranularity,
  type SeriesRange,
  type SetterSeriesBucket,
  type SetterTrends,
} from "./metricSeries";

// ---------------------------------------------------------------------------
// Card trend lines for ONE closer's / setter's dashboard (closer portal and
// admin "view dashboard") — the per-person twin of the Sales Overview's
// trends. Read-only: day rows on the cards' own definitions, folded by the
// pure lib/metricSeries.ts, so a window's buckets add up to its card numbers.
// ---------------------------------------------------------------------------

interface TrendBounds {
  lifetimeRanges: SeriesRange[];
  /** One read covering the 12 months AND the window + its previous period. */
  readSince: string;
  readUntil: string;
  window: { granularity: SeriesGranularity; current: SeriesRange[]; previous: SeriesRange[] | null } | null;
}

function trendBounds(since?: string, until?: string): TrendBounds {
  const lifetimeRanges = lastMonthsRanges(businessTodayYmd(), 12);
  const lifetimeSince = lifetimeRanges[0].start;
  const lifetimeUntil = lifetimeRanges[lifetimeRanges.length - 1].end;
  const prev = since && until ? previousWindowBounds(since, until) : null;
  const granularity = since && until ? seriesGranularity(since, until) : null;
  return {
    lifetimeRanges,
    readSince: [lifetimeSince, prev?.since ?? since ?? lifetimeSince].sort()[0],
    readUntil: [lifetimeUntil, until ?? lifetimeUntil].sort()[1],
    window:
      since && until && granularity
        ? {
            granularity,
            current: bucketRanges(since, until, granularity),
            previous: prev ? bucketRanges(prev.since, prev.until, granularity) : null,
          }
        : null,
  };
}

/** One closer's months + window, incl. their own attendance marks (the show-rate cards). */
export async function getCloserTrends(
  closerId: string,
  since?: string,
  until?: string
): Promise<OverviewTrends> {
  const b = trendBounds(since, until);
  const [deals, attendance] = await Promise.all([
    getDealDayRows(b.readSince, b.readUntil, { closerId }),
    getAttendanceDayRows(b.readSince, b.readUntil, closerId),
  ]);
  return {
    lifetime: { buckets: bucketize(b.lifetimeRanges, deals, attendance), topPerformer: null },
    window: b.window
      ? {
          granularity: b.window.granularity,
          current: bucketize(b.window.current, deals, attendance),
          previous: b.window.previous ? bucketize(b.window.previous, deals, attendance) : null,
        }
      : null,
  };
}

/** One setter's months + window: credited deals + appointments set. */
export async function getSetterTrends(
  setterId: string,
  since?: string,
  until?: string
): Promise<SetterTrends> {
  const b = trendBounds(since, until);
  const [deals, appointments] = await Promise.all([
    getDealDayRows(b.readSince, b.readUntil, { setterId }),
    getSetterAppointmentDayRows(setterId, b.readSince, b.readUntil),
  ]);
  const fold = (ranges: SeriesRange[]): SetterSeriesBucket[] => {
    const counts = bucketCounts(ranges, appointments);
    return bucketize(ranges, deals).map((bucket, i) => ({ ...bucket, appointments: counts[i] }));
  };
  return {
    lifetime: fold(b.lifetimeRanges),
    window: b.window
      ? {
          granularity: b.window.granularity,
          current: fold(b.window.current),
          previous: b.window.previous ? fold(b.window.previous) : null,
        }
      : null,
  };
}
