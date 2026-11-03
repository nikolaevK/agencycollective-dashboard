"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DateRangeInput, DatePreset } from "@/types/api";
import { parseDateRangeFromParams } from "@/lib/utils";

const DEFAULT_PRESET: DatePreset = "last_7d";

export function useDateRange() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Same range → same object, so memoized consumers (and effects / callbacks
  // that depend on it) don't re-run on every render of the page.
  const parsed = parseDateRangeFromParams(searchParams);
  const dateRange: DateRangeInput = useMemo(
    () => parsed,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, not identity
    [parsed.preset, parsed.since, parsed.until]
  );

  const setDateRange = useCallback(
    (newRange: DateRangeInput) => {
      const params = new URLSearchParams(searchParams.toString());

      // Clear old params
      params.delete("preset");
      params.delete("since");
      params.delete("until");

      if (newRange.preset) {
        params.set("preset", newRange.preset);
      } else if (newRange.since && newRange.until) {
        params.set("since", newRange.since);
        params.set("until", newRange.until);
      } else {
        params.set("preset", DEFAULT_PRESET);
      }

      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const setPreset = useCallback(
    (preset: DatePreset) => setDateRange({ preset }),
    [setDateRange]
  );

  const setCustomRange = useCallback(
    (since: string, until: string) => setDateRange({ since, until }),
    [setDateRange]
  );

  // The range as a query string ("preset=last_7d" / "since=…&until=…") —
  // carried into drill-down links so the next page shows the same period.
  const dateQuery = dateRange.preset
    ? `preset=${dateRange.preset}`
    : dateRange.since && dateRange.until
      ? `since=${dateRange.since}&until=${dateRange.until}`
      : "";

  return {
    dateRange,
    dateQuery,
    setDateRange,
    setPreset,
    setCustomRange,
    isCustom: !dateRange.preset,
    currentPreset: dateRange.preset ?? null,
  };
}
