/**
 * generate_report's free-text `period` → the date range its data is pulled
 * for (pure). Before this, anything the parser didn't know ("March 2026",
 * "the last 30 days") silently became the last 7 days while the report still
 * printed the requested label. Now: presets, explicit ranges and month names
 * resolve; anything else uses the dashboard's current period — and the label
 * always describes the data that was actually used.
 */

import type { DatePreset, DateRangeInput } from "@/types/api";
import { isRealYmd } from "@/lib/businessTime";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7d: "Last 7 days",
  last_14d: "Last 14 days",
  last_30d: "Last 30 days",
  last_90d: "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function presetLabel(preset: DatePreset): string {
  return PRESET_LABELS[preset] ?? preset;
}

/** Human label for any dashboard range. */
export function dateRangeLabel(range: DateRangeInput): string {
  if (range.preset) return presetLabel(range.preset);
  if (range.since && range.until) return `${range.since} to ${range.until}`;
  return PRESET_LABELS.last_7d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `ymd` shifted by `days` (calendar arithmetic, yyyy-mm-dd). */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const LAST_N_DAYS: Partial<Record<DatePreset, number>> = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };

/**
 * A preset → the explicit dates it means on `todayYmd` (business timezone),
 * with Meta's preset semantics: today; yesterday; last N days = the N days
 * before today; this month = the 1st through today; last month = the whole
 * previous month. Every preset's meaning moves with the calendar, while the
 * 24h Meta cache keys on the request — so a preset fetched late one day would
 * be served as the next day's. Explicit dates make each day its own query.
 * Explicit ranges pass through unchanged.
 */
export function resolvePresetDates(range: DateRangeInput, todayYmd: string): DateRangeInput {
  if (!range.preset) return range;
  const [year, month] = todayYmd.split("-").map(Number);
  switch (range.preset) {
    case "today":
      return { since: todayYmd, until: todayYmd };
    case "yesterday": {
      const day = addDays(todayYmd, -1);
      return { since: day, until: day };
    }
    case "this_month":
      return { since: `${year}-${pad(month)}-01`, until: todayYmd };
    case "last_month": {
      const firstOfThisMonth = `${year}-${pad(month)}-01`;
      const until = addDays(firstOfThisMonth, -1);
      return { since: `${until.slice(0, 7)}-01`, until };
    }
    default: {
      const days = LAST_N_DAYS[range.preset] ?? 7;
      return { since: addDays(todayYmd, -days), until: addDays(todayYmd, -1) };
    }
  }
}

export function resolveReportPeriod(
  period: string | undefined,
  fallback: DateRangeInput,
  todayYmd: string
): { dateRange: DateRangeInput; label: string } {
  const fallbackResult = { dateRange: fallback, label: dateRangeLabel(fallback) };
  const p = (period ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/^the /, "");
  if (!p) return fallbackResult;

  if (p === "today") return { dateRange: { preset: "today" }, label: PRESET_LABELS.today };
  if (p === "yesterday") return { dateRange: { preset: "yesterday" }, label: PRESET_LABELS.yesterday };
  if (p === "this month" || p === "month to date") return { dateRange: { preset: "this_month" }, label: PRESET_LABELS.this_month };
  if (p === "last month" || p === "previous month") return { dateRange: { preset: "last_month" }, label: PRESET_LABELS.last_month };

  const lastN = p.match(/^(?:last|past) (7|14|30|90) ?d(?:ays?)?$/);
  if (lastN) {
    const preset = `last_${lastN[1]}d` as DatePreset;
    return { dateRange: { preset }, label: PRESET_LABELS[preset] };
  }

  const range = p.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|through|–|—|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (range && isRealYmd(range[1]) && isRealYmd(range[2]) && range[1] <= range[2]) {
    const until = range[2] > todayYmd ? todayYmd : range[2];
    if (range[1] <= until) return { dateRange: { since: range[1], until }, label: `${range[1]} to ${until}` };
  }

  const month = p.match(/^([a-z]+)\.? (\d{4})$/);
  if (month) {
    const idx = MONTHS.indexOf(month[1].slice(0, 3));
    const year = Number(month[2]);
    if (idx >= 0 && year >= 2015 && year <= 2100 && MONTH_NAMES[idx].toLowerCase().startsWith(month[1])) {
      const since = `${year}-${pad(idx + 1)}-01`;
      const lastDay = new Date(Date.UTC(year, idx + 1, 0)).getUTCDate();
      let until = `${year}-${pad(idx + 1)}-${pad(lastDay)}`;
      if (since <= todayYmd) {
        if (until > todayYmd) until = todayYmd;
        return { dateRange: { since, until }, label: `${MONTH_NAMES[idx]} ${year}` };
      }
    }
  }

  return fallbackResult;
}
