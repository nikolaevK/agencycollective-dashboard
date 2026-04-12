"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DateRangeInput, DatePreset } from "@/types/api";
import { parseDateRangeFromParams } from "@/lib/utils";

const DEFAULT_PRESET: DatePreset = "last_7d";

export function useDateRange() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const dateRange: DateRangeInput = parseDateRangeFromParams(searchParams);

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

  return {
    dateRange,
    setDateRange,
    setPreset,
    setCustomRange,
    isCustom: !dateRange.preset,
    currentPreset: dateRange.preset ?? null,
  };
}
