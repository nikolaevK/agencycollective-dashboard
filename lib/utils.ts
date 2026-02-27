import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import type { DatePreset, DateRangeInput } from "@/types/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function formatDelta(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Returns true if the delta is "good" for the metric
export function isDeltaPositive(metric: string, delta: number | null): boolean | null {
  if (delta === null) return null;
  // Lower is better for CPC
  if (metric === "cpc") return delta <= 0;
  return delta >= 0;
}

/**
 * Convert a DatePreset or custom range to Meta API parameters
 */
export function dateRangeToMetaParams(input: DateRangeInput): {
  date_preset?: string;
  time_range?: string;
} {
  if (input.preset) {
    const presetMap: Record<DatePreset, string> = {
      today: "today",
      yesterday: "yesterday",
      last_7d: "last_7d",
      last_14d: "last_14d",
      last_30d: "last_30d",
      last_90d: "last_90d",
      this_month: "this_month",
      last_month: "last_month",
    };
    return { date_preset: presetMap[input.preset] };
  }

  if (input.since && input.until) {
    return {
      time_range: JSON.stringify({ since: input.since, until: input.until }),
    };
  }

  // Default: last 30 days
  return { date_preset: "last_30d" };
}

/**
 * Compute the "previous period" for delta calculations
 */
export function getPreviousPeriod(input: DateRangeInput): DateRangeInput {
  const today = new Date();

  if (input.preset) {
    const daysMap: Record<DatePreset, number> = {
      today: 1,
      yesterday: 1,
      last_7d: 7,
      last_14d: 14,
      last_30d: 30,
      last_90d: 90,
      this_month: today.getDate(),
      last_month: new Date(today.getFullYear(), today.getMonth(), 0).getDate(),
    };

    const days = daysMap[input.preset];

    if (input.preset === "this_month") {
      const prevMonthStart = startOfMonth(subMonths(today, 1));
      const prevMonthEnd = endOfMonth(subMonths(today, 1));
      return {
        since: format(prevMonthStart, "yyyy-MM-dd"),
        until: format(prevMonthEnd, "yyyy-MM-dd"),
      };
    }

    if (input.preset === "last_month") {
      const twoMonthsAgo = subMonths(today, 2);
      return {
        since: format(startOfMonth(twoMonthsAgo), "yyyy-MM-dd"),
        until: format(endOfMonth(twoMonthsAgo), "yyyy-MM-dd"),
      };
    }

    const currentEnd = subDays(today, input.preset === "today" ? 0 : 1);
    const currentStart = subDays(currentEnd, days - 1);
    const prevEnd = subDays(currentStart, 1);
    const prevStart = subDays(prevEnd, days - 1);

    return {
      since: format(prevStart, "yyyy-MM-dd"),
      until: format(prevEnd, "yyyy-MM-dd"),
    };
  }

  if (input.since && input.until) {
    const since = new Date(input.since);
    const until = new Date(input.until);
    const duration = Math.ceil(
      (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const prevUntil = subDays(since, 1);
    const prevSince = subDays(prevUntil, duration - 1);

    return {
      since: format(prevSince, "yyyy-MM-dd"),
      until: format(prevUntil, "yyyy-MM-dd"),
    };
  }

  // Default fallback
  return { preset: "last_30d" };
}

/**
 * Compute percent change from previous to current
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Build a cache key string from a date range input
 */
export function dateRangeCacheKey(input: DateRangeInput): string {
  if (input.preset) return input.preset;
  if (input.since && input.until) return `${input.since}_${input.until}`;
  return "last_30d";
}

/**
 * Parse date range from URL search params
 */
export function parseDateRangeFromParams(
  params: URLSearchParams
): DateRangeInput {
  const preset = params.get("preset") as DatePreset | null;
  const since = params.get("since");
  const until = params.get("until");

  if (preset) return { preset };
  if (since && until) return { since, until };
  return { preset: "last_30d" };
}
