"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { AgencyLogo } from "@/components/layout/AgencyLogo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DateRangePicker } from "@/components/filters/DateRangePicker";
import { useDateRange } from "@/hooks/useDateRange";

const DATE_PICKER_ROUTES = ["/dashboard", "/dashboard/chat"];

interface MobileHeaderProps {
  onMenuClick?: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const pathname = usePathname();
  const { dateRange, setDateRange } = useDateRange();

  const showDatePicker = DATE_PICKER_ROUTES.some((route) =>
    route === "/dashboard" ? pathname === route : pathname.startsWith(route)
  );

  return (
    <header className="md:hidden space-y-2 bg-background px-4 pt-3 pb-2">
      {/* Top row: hamburger + logo + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onMenuClick}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <AgencyLogo />
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href="/dashboard/alerts"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {/* Date picker — only on dashboard & AI analyst */}
      {showDatePicker && (
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      )}
    </header>
  );
}
