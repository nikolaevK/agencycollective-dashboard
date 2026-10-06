"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <button
        onClick={goPrev}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 dark:border-white/[0.06]",
          "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="min-w-[180px] text-center">
        <span className="text-sm font-semibold text-foreground">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        {isFuture && (
          <span className="ml-2 inline-flex items-center rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
            Future month
          </span>
        )}
      </div>

      <button
        onClick={goNext}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 dark:border-white/[0.06]",
          "bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {!isCurrentMonth && (
        <button
          onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          Today
        </button>
      )}
    </div>
  );
}
