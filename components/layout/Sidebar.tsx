"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Bell, BookOpen, Users, UserCog, LogOut, X, Sparkles, ImageIcon, PenTool, Handshake, Braces } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { AgencyLogo } from "@/components/layout/AgencyLogo";
import { useAdmin } from "@/components/providers/AdminProvider";
import type { PermissionKey } from "@/lib/permissions";

interface SidebarProps {
  isOpen?: boolean;
  collapsed?: boolean;
  onClose?: () => void;
}

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm: PermissionKey; superOnly?: boolean }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true, perm: "dashboard" },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell, perm: "dashboard" },
  { href: "/dashboard/chat", label: "AI Analyst", icon: Sparkles, perm: "analyst" },
  { href: "/dashboard/generate", label: "Image Generator", icon: ImageIcon, perm: "studio" },
  { href: "/dashboard/json-editor", label: "JSON Editor", icon: Braces, perm: "jsoneditor" },
  { href: "/dashboard/ad-copy", label: "Ad Copy", icon: PenTool, perm: "adcopy" },
  { href: "/dashboard/users", label: "Users", icon: Users, perm: "users" },
  { href: "/dashboard/closers", label: "Closers", icon: Handshake, perm: "closers" },
  { href: "/dashboard/settings", label: "Documentation", icon: BookOpen, perm: "dashboard" },
  { href: "/dashboard/admins", label: "Admins", icon: UserCog, perm: "admin" },
];

export function Sidebar({ isOpen = false, collapsed = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAdmin();
  const { dateRange } = useDateRange();
  const { data: alerts } = useAlerts(dateRange);
  const criticalCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const totalCount = alerts?.length ?? 0;

  // Filter nav items by permissions (superOnly items only visible to super admins)
  const visibleItems = navItems.filter(
    (item) => item.superOnly ? admin.isSuper : (admin.isSuper || admin.permissions[item.perm])
  );

  async function handleLogout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    router.push("/?portal=admin");
  }

  return (
    <aside
      className={cn(
        "ac-sidebar flex h-full shrink-0 flex-col border-r transition-all duration-200 ease-in-out",
        "fixed inset-y-0 left-0 z-50",
        "md:relative md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        collapsed ? "md:w-16 w-64" : "w-64"
      )}
    >
      {/* Logo row — close button on mobile */}
      <div
        className={cn(
          "flex h-16 items-center border-b",
          collapsed ? "md:justify-center md:px-2 px-5 justify-between" : "justify-between px-5"
        )}
        style={{ borderColor: "hsl(var(--sidebar-border))" }}
      >
        <div className={cn(collapsed && "md:hidden")}>
          <AgencyLogo />
        </div>
        {collapsed && (
          <div className="hidden md:flex items-center justify-center">
            <span className="text-lg font-bold text-primary">AC</span>
          </div>
        )}
        <button
          onClick={onClose}
          className="md:hidden rounded-lg p-1.5 text-current opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-0.5 py-4", collapsed ? "md:px-2 px-3" : "px-3")}>
        <p className={cn(
          "mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest opacity-40",
          collapsed && "md:hidden"
        )}>
          Admin
        </p>
        {visibleItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={cn(
                "ac-sidebar-link flex items-center rounded-lg text-sm font-medium",
                collapsed ? "md:justify-center md:px-0 md:py-2.5 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5",
                isActive && "active"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && "md:hidden")}>{item.label}</span>
              {item.label === "Alerts" && totalCount > 0 && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                    collapsed ? "md:absolute md:top-0 md:right-0 md:h-4 md:min-w-4 md:text-[9px] md:px-1" : "ml-auto",
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

      {/* Footer — logout */}
      <div className={cn("border-t", collapsed ? "md:p-2 p-3" : "p-3")} style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <button
          onClick={handleLogout}
          title={collapsed ? "Log out" : undefined}
          className={cn(
            "ac-sidebar-link flex w-full items-center rounded-lg text-sm font-medium",
            collapsed ? "md:justify-center md:px-0 md:py-2.5 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={cn(collapsed && "md:hidden")}>Log out</span>
        </button>
      </div>
    </aside>
  );
}
