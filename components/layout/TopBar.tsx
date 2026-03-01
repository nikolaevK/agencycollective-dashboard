"use client";

import { RefreshCw, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { DateRangePicker } from "@/components/filters/DateRangePicker";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { dateRange, setDateRange } = useDateRange();
  const { data: accounts } = useAccounts(dateRange);

  async function handleRefresh() {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 1000);
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 md:px-6 gap-2">
      {/* Left: hamburger (mobile) + account badge */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        {accounts && accounts.length > 0 && (
          <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Right: date picker + refresh + theme */}
      <div className="flex items-center gap-2">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <button
          onClick={handleRefresh}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
            isRefreshing && "opacity-50 cursor-not-allowed"
          )}
          disabled={isRefreshing}
          title="Refresh all data"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
