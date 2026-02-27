"use client";

import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { DateRangePicker } from "@/components/filters/DateRangePicker";

export function TopBar() {
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
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div />
      <div className="flex items-center gap-3">
        {accounts && accounts.length > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </span>
        )}
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <button
          onClick={handleRefresh}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            isRefreshing && "opacity-50 cursor-not-allowed"
          )}
          disabled={isRefreshing}
          title="Refresh all data"
        >
          <RefreshCw
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          />
        </button>
      </div>
    </header>
  );
}
