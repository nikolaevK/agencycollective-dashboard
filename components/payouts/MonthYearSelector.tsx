"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthYearSelectorProps {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}

export function MonthYearSelector({
  month,
  year,
  onChange,
}: MonthYearSelectorProps) {
  const goPrev = () => {
    if (month === 1) {
      onChange(12, year - 1);
    } else {
      onChange(month - 1, year);
    }
  };

  const goNext = () => {
    if (month === 12) {
      onChange(1, year + 1);
    } else {
      onChange(month + 1, year);
    }
  };

  // Future months are navigable — re-bills are often recorded for a month
  // before it turns (or booked ahead), so the picker can't stop at "today".
  const now = new Date();
  const isFuture =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month > now.getMonth() + 1);
  const isCurrentMonth =
    month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={goPrev}
        aria-label="Previous month"
      >
        <ChevronLeft />
      </Button>

      <div className="min-w-[180px] text-center">
        <span className="text-sm font-semibold tracking-tight">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        {isFuture && (
          <StatusBadge tone="info" className="ml-2 align-middle">
            Future month
          </StatusBadge>
        )}
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={goNext}
        aria-label="Next month"
      >
        <ChevronRight />
      </Button>

      {!isCurrentMonth && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}
        >
          Today
        </Button>
      )}
    </div>
  );
}
