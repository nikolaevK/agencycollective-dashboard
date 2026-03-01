"use client";

import { Menu } from "lucide-react";
import { useDateRange } from "@/hooks/useDateRange";
import { DateRangePicker } from "@/components/filters/DateRangePicker";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface UserTopBarProps {
  accountName?: string;
  currency?: string;
  onMenuClick?: () => void;
}

export function UserTopBar({ accountName, currency, onMenuClick }: UserTopBarProps) {
  const { dateRange, setDateRange } = useDateRange();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 md:px-6 gap-2">
      {/* Left: hamburger (mobile) + account info */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        {accountName && (
          <span className="text-sm font-semibold text-foreground truncate">{accountName}</span>
        )}
        {currency && (
          <span className="hidden sm:inline-flex shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {currency}
          </span>
        )}
      </div>

      {/* Right: date picker + theme toggle */}
      <div className="flex shrink-0 items-center gap-2">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <ThemeToggle />
      </div>
    </header>
  );
}
