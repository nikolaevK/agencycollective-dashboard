/**
 * Trend lines for the Sales Overview metric cards. Pure (no db imports) so
 * the client renders from the same shapes the stats route builds.
 *
 * The server returns raw per-day rows; `bucketize` folds them into
 * zero-filled buckets with the SAME inclusive string comparison the card
 * totals use in SQL (`day >= since AND day <= until`), so a window's buckets
 * always add up to the card's number.
 */

export type SeriesGranularity = "day" | "week" | "month";

export interface SeriesSums {
  closedRevenue: number;
  paidRevenue: number;
  outstandingRevenue: number;
  pendingPipeline: number;
  closedCount: number;
  pendingCount: number;
  inFlightCount: number;
  showCount: number;
  noShowCount: number;
}

/** One effective day of deal sums for one closer (the series query's rows). */
export interface DealDayRow extends Omit<SeriesSums, "showCount" | "noShowCount"> {
  day: string;
  closerId: string;
}

/** One day of team attendance marks. */
export interface AttendanceDayRow {
  day: string;
  showCount: number;
  noShowCount: number;
}

/** Inclusive YYYY-MM-DD bounds of one bucket. */
export interface SeriesRange {
  start: string;
  end: string;
}

export interface SeriesBucket extends SeriesRange, SeriesSums {}

export interface OverviewTrends {
  /** Last 12 calendar months (business timezone), one bucket per month. */
  lifetime: {
    buckets: SeriesBucket[];
    /** The top performer's own months. Null when there's no top performer. */
    topPerformer: SeriesBucket[] | null;
  };
  /** The selected window and the period before it (index-aligned). Null
   *  for "All time". */
  window: {
    granularity: SeriesGranularity;
    current: SeriesBucket[];
    previous: SeriesBucket[] | null;
  } | null;
}

/** A setter's bucket: the deals credited to them (same sums as a closer's —
 *  closedRevenue = revenue attributed, closedCount = deals credited) plus the
 *  appointments they set, by the setter cards' date basis. */
export interface SetterSeriesBucket extends SeriesBucket {
  appointments: number;
}

/** Card trend lines for the setter dashboard (OverviewTrends' setter twin). */
export interface SetterTrends {
  lifetime: SetterSeriesBucket[];
  window: {
    granularity: SeriesGranularity;
    current: SetterSeriesBucket[];
    previous: SetterSeriesBucket[] | null;
  } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`);
}

function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Daily up to a quarter, weekly up to a year, monthly beyond. */
export function seriesGranularity(since: string, until: string): SeriesGranularity {
  const days = Math.round((toMs(until) - toMs(since)) / DAY_MS) + 1;
  if (days <= 92) return "day";
  if (days <= 366) return "week";
  return "month";
}

/**
 * Contiguous buckets covering [since, until]. Weeks are 7-day steps from
 * `since` (so a window and its previous period line up bucket for bucket);
 * months are calendar months, clipped to the window at both ends.
 */
export function bucketRanges(
  since: string,
  until: string,
  granularity: SeriesGranularity
): SeriesRange[] {
  const startMs = toMs(since);
  const endMs = toMs(until);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return [];
  // Real calendar dates only — Date.parse rolls "2026-02-31" over to Mar 3,
  // past the day the cards' SQL text comparison stops at.
  if (toYmd(startMs) !== since || toYmd(endMs) !== until) return [];
  const ranges: SeriesRange[] = [];
  let cur = startMs;
  while (cur <= endMs) {
    let next: number;
    if (granularity === "day") next = cur + DAY_MS;
    else if (granularity === "week") next = cur + 7 * DAY_MS;
    else {
      const d = new Date(cur);
      next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
    ranges.push({ start: toYmd(cur), end: toYmd(Math.min(next - DAY_MS, endMs)) });
    cur = next;
  }
  return ranges;
}

/** The last `months` whole calendar months, ending with `todayYmd`'s month. */
export function lastMonthsRanges(todayYmd: string, months: number): SeriesRange[] {
  const [y, m] = todayYmd.split("-").map(Number);
  const first = Date.UTC(y, m - 1 - (months - 1), 1);
  const lastDay = Date.UTC(y, m, 0);
  return bucketRanges(toYmd(first), toYmd(lastDay), "month");
}

function emptySums(): SeriesSums {
  return {
    closedRevenue: 0,
    paidRevenue: 0,
    outstandingRevenue: 0,
    pendingPipeline: 0,
    closedCount: 0,
    pendingCount: 0,
    inFlightCount: 0,
    showCount: 0,
    noShowCount: 0,
  };
}

export function bucketize(
  ranges: SeriesRange[],
  deals: DealDayRow[],
  attendance: AttendanceDayRow[] = []
): SeriesBucket[] {
  const buckets: SeriesBucket[] = ranges.map((r) => ({ ...r, ...emptySums() }));
  // A day belongs to the last bucket starting on or before it; past the
  // final bucket's end it's outside the window, exactly like the SQL
  // `<= until`. String compare, as SQLite compares the stored text.
  const indexOf = (day: string): number => {
    if (buckets.length === 0 || day < buckets[0].start) return -1;
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (buckets[mid].start <= day) lo = mid;
      else hi = mid - 1;
    }
    if (lo === buckets.length - 1 && day > buckets[lo].end) return -1;
    return lo;
  };

  for (const r of deals) {
    const i = indexOf(r.day);
    if (i < 0) continue;
    const b = buckets[i];
    b.closedRevenue += r.closedRevenue;
    b.paidRevenue += r.paidRevenue;
    b.outstandingRevenue += r.outstandingRevenue;
    b.pendingPipeline += r.pendingPipeline;
    b.closedCount += r.closedCount;
    b.pendingCount += r.pendingCount;
    b.inFlightCount += r.inFlightCount;
  }
  for (const r of attendance) {
    const i = indexOf(r.day);
    if (i < 0) continue;
    buckets[i].showCount += r.showCount;
    buckets[i].noShowCount += r.noShowCount;
  }
  return buckets;
}

/** Per-day counts folded into `ranges` (index-aligned), same bucket rule as
 *  bucketize: a day past the last bucket's end is outside the window. */
export function bucketCounts(
  ranges: SeriesRange[],
  rows: ReadonlyArray<{ day: string; count: number }>
): number[] {
  const out = ranges.map(() => 0);
  for (const r of rows) {
    if (ranges.length === 0 || r.day < ranges[0].start) continue;
    let i = ranges.length - 1;
    while (i > 0 && ranges[i].start > r.day) i--;
    if (i === ranges.length - 1 && r.day > ranges[i].end) continue;
    out[i] += r.count;
  }
  return out;
}

/** Running total of one value — a window card's line ends at its number. */
export function runningTotal<B extends SeriesBucket>(
  buckets: B[],
  pick: (b: B) => number
): number[] {
  let sum = 0;
  return buckets.map((b) => (sum += pick(b)));
}

/** Percentage with one decimal (the cards' rounding); null while the
 *  denominator is still 0, so the line starts where data does. */
export function ratePct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}
