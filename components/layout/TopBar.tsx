"use client";

import { RefreshCw, Menu, LogOut, ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { DateRangePicker } from "@/components/filters/DateRangePicker";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useAdmin } from "@/components/providers/AdminProvider";

interface TopBarProps {
  onMenuClick?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function TopBar({ onMenuClick, sidebarCollapsed, onToggleSidebar }: TopBarProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const admin = useAdmin();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { dateRange, setDateRange } = useDateRange();
  const { data: accounts } = useAccounts(dateRange);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 1000);
  }

  async function handleLogout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    router.push("/?portal=admin");
  }

  const initials = getInitials(admin.displayName, admin.username);
  const roleLabel = admin.isSuper ? "Super Admin" : "Admin";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 md:px-6 gap-2">
      {/* Left: hamburger (mobile) + sidebar toggle (desktop) + account badge */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}
        {accounts && accounts.length > 0 && (
          <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Right: date picker + refresh + theme + avatar */}
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
        <NotificationBell />
        <ThemeToggle />

        {/* Admin avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-accent transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold overflow-hidden">
              {admin.avatarPath ? (
                <Image
                  src={admin.avatarPath}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-sm font-medium truncate">{admin.displayName || admin.username}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
