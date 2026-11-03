"use client";

import { RefreshCw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { useAdmin } from "@/components/providers/AdminProvider";
import { DateRangePicker } from "@/components/filters/DateRangePicker";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { DateRangeInput } from "@/types/api";

interface TopBarProps {
  /** @deprecated Unused — the TopBar only renders from md, where there is no drawer to open (MobileHeader + BottomNav open it). */
  onMenuClick?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

// Account actions (name, role, Log out) live in the sidebar footer menu.
export function TopBar({ sidebarCollapsed, onToggleSidebar }: TopBarProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { dateRange, setDateRange } = useDateRange();
  const admin = useAdmin();
  // /api/accounts needs dashboard, analyst or adcopy (middleware
  // API_PERMISSIONS) — for anyone else the badge's query would only 403.
  const accountsEnabled =
    admin.isSuper || admin.permissions.dashboard || admin.permissions.analyst || admin.permissions.adcopy;

  async function handleRefresh() {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 1000);
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
      {/* Left: sidebar toggle + account badge */}
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              className="hidden -ml-1.5 md:inline-flex"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <Separator orientation="vertical" className="hidden h-4 md:block" />
          </>
        )}
        {accountsEnabled && <AccountsBadge dateRange={dateRange} />}
      </div>

      {/* Right: date picker + refresh + notifications + theme */}
      <div className="flex items-center gap-2">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh all data"
          aria-label="Refresh all data"
        >
          <RefreshCw className={cn(isRefreshing && "animate-spin")} />
        </Button>
        <NotificationBell />
        <ThemeToggle className={cn(buttonVariants({ variant: "outline", size: "icon" }), "text-foreground")} />
      </div>
    </header>
  );
}

/** "N accounts" — mounted only for admins allowed /api/accounts, so its query is too. */
function AccountsBadge({ dateRange }: { dateRange: DateRangeInput }) {
  const { data: accounts } = useAccounts(dateRange);
  if (!accounts || accounts.length === 0) return null;
  return (
    <Badge variant="secondary" className="hidden sm:inline-flex">
      {accounts.length} account{accounts.length !== 1 ? "s" : ""}
    </Badge>
  );
}
