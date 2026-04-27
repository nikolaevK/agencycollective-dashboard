/**
 * Shared time-frame model for the metric surfaces (admin queue, closer
 * dashboard, setter dashboard). All three surfaces use the same enum,
 * default to "month" (current month), and resolve to a [since, until)
 * window of YYYY-MM-DD strings — the same shape `readDeals({since,until})`
 * already understands.
 */

export type TimeFrameKey = "week" | "month" | "quarter" | "year" | "all" | "custom";

export const TIME_FRAME_LABELS: Record<TimeFrameKey, string> = {
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  all: "All time",
  custom: "Custom",
};

export const TIME_FRAME_OPTIONS: { value: Exclude<TimeFrameKey, "custom">; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

export interface TimeFrame {
  key: TimeFrameKey;
  /** Inclusive start, YYYY-MM-DD, undefined for "all". */
  since?: string;
  /** Inclusive end, YYYY-MM-DD, undefined for "all". */
  until?: string;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Build a TimeFrame for one of the preset keys. `now` is injectable for
 *  testing; production callers can omit. Custom requires explicit since/until. */
export function buildTimeFrame(
  key: Exclude<TimeFrameKey, "custom">,
  now: Date = new Date()
): TimeFrame {
  if (key === "all") return { key };

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = today;

  if (key === "week") {
    // Monday = start of week (matches the rest of the project, which uses
    // weekStartsOn: 1 in date-fns calls).
    const day = today.getDay(); // 0=Sun..6=Sat
    const offsetToMonday = day === 0 ? 6 : day - 1;
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetToMonday);
  } else if (key === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (key === "quarter") {
    const q = Math.floor(today.getMonth() / 3);
    start = new Date(today.getFullYear(), q * 3, 1);
  } else if (key === "year") {
    start = new Date(today.getFullYear(), 0, 1);
  }

  return { key, since: ymd(start), until: ymd(today) };
}

/** Custom range — caller supplies bounds. Returns the canonical TimeFrame. */
export function customTimeFrame(since: string, until: string): TimeFrame {
  return { key: "custom", since, until };
}

/** Encode for URLSearchParams / queryKey. Stable shape so React Query
 *  caches don't duplicate when the same window is requested differently. */
export function timeFrameQuery(tf: TimeFrame): { since?: string; until?: string } {
  return tf.since && tf.until ? { since: tf.since, until: tf.until } : {};
}

/** Append `?since=…&until=…` to a URL when the frame is bounded. */
export function appendTimeFrameParams(base: string, tf: TimeFrame): string {
  if (!tf.since || !tf.until) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}since=${tf.since}&until=${tf.until}`;
}
