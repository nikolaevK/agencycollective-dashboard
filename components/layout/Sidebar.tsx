"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bell, Settings, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { AgencyLogo } from "@/components/layout/AgencyLogo";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { dateRange } = useDateRange();
  const { data: alerts } = useAlerts(dateRange);
  const criticalCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const totalCount = alerts?.length ?? 0;

  return (
    <aside
      className={cn(
        "ac-sidebar flex h-full w-64 shrink-0 flex-col border-r",
        // Mobile: fixed overlay, slides in/out
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
        // Desktop: static in normal flow
        "md:relative md:translate-x-0",
        // Mobile open/closed
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Logo row — close button on mobile */}
      <div
        className="flex h-16 items-center justify-between border-b px-5"
        style={{ borderColor: "hsl(var(--sidebar-border))" }}
      >
        <AgencyLogo />
        <button
          onClick={onClose}
          className="md:hidden rounded-lg p-1.5 text-current opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest opacity-40">
          Admin
        </p>
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn("ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", isActive && "active")}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {item.label === "Alerts" && totalCount > 0 && (
                <span
                  className={cn(
                    "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                    criticalCount > 0 ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"
                  )}
                >
                  {totalCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t px-5 py-3" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <p className="text-xs opacity-40">Agency Collective v1.0</p>
      </div>
    </aside>
  );
}
