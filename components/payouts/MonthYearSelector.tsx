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

  const now = new Date();
  const isCurrentMonth =
    month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <div className="flex items-center gap-2">
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
      </div>

      <button
        onClick={goNext}
        disabled={isCurrentMonth}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 dark:border-white/[0.06]",
          "bg-card text-muted-foreground transition-colors",
          isCurrentMonth
            ? "opacity-40 cursor-not-allowed"
            : "hover:text-foreground hover:bg-muted/50"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
