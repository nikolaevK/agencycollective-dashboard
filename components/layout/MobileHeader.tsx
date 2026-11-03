"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgencyLogo } from "@/components/layout/AgencyLogo";
import { UserAvatar } from "@/components/layout/NavUserButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { DateRangePicker } from "@/components/filters/DateRangePicker";
import { useDateRange } from "@/hooks/useDateRange";
import { useAdmin } from "@/components/providers/AdminProvider";
import { CREATIVE_PATH, resolveCreativeTab } from "@/components/creative/creativeTabs";

const DATE_PICKER_ROUTES = ["/dashboard"];

interface MobileHeaderProps {
  onMenuClick?: () => void;
}

// Account actions (Log out) are in the menu drawer's footer.
export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const admin = useAdmin();
  const { dateRange, setDateRange } = useDateRange();

  // Creative Studio: only its AI Analyst tab reads the range — resolved exactly
  // like the page resolves the tab it shows.
  const showDatePicker =
    DATE_PICKER_ROUTES.some((route) =>
      route === "/dashboard" ? pathname === route : pathname.startsWith(route)
    ) || (pathname === CREATIVE_PATH && resolveCreativeTab(admin, searchParams.get("tab")) === "analyst");

  return (
    <header className="md:hidden space-y-2 bg-background px-4 pt-3 pb-2">
      {/* Top row: hamburger + logo + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" size="icon" onClick={onMenuClick} aria-label="Open menu">
            <Menu />
          </Button>
          <AgencyLogo />
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell />
          <ThemeToggle className={cn(buttonVariants({ variant: "outline", size: "icon" }), "text-foreground")} />
          <Button asChild variant="outline" size="icon">
            <Link href="/dashboard/alerts" aria-label="Alerts">
              <AlertTriangle />
            </Link>
          </Button>
          <UserAvatar className="size-7 text-[10px]" />
        </div>
      </div>
      {/* Date picker — only on dashboard & AI analyst */}
      {showDatePicker && (
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      )}
    </header>
  );
}
