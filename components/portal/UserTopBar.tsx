"use client";

import { useDateRange } from "@/hooks/useDateRange";
import { DateRangePicker } from "@/components/filters/DateRangePicker";

interface UserTopBarProps {
  accountName?: string;
  currency?: string;
}

export function UserTopBar({ accountName, currency }: UserTopBarProps) {
  const { dateRange, setDateRange } = useDateRange();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-3">
        {accountName && (
          <span className="text-sm font-medium text-foreground">{accountName}</span>
        )}
        {currency && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground font-medium">
            {currency}
          </span>
        )}
      </div>
      <DateRangePicker value={dateRange} onChange={setDateRange} />
    </header>
  );
}
