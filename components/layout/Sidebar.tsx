"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Bell, BookOpen, Users, UserCog, LogOut, X, Sparkles, ImageIcon, PenTool } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { AgencyLogo } from "@/components/layout/AgencyLogo";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isSuperAdmin?: boolean;
}

const baseNavItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/chat", label: "AI Analyst", icon: Sparkles },
  { href: "/dashboard/generate", label: "Image Generator", icon: ImageIcon },
  { href: "/dashboard/ad-copy", label: "Ad Copy", icon: PenTool },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/settings", label: "Documentation", icon: BookOpen },
];

const superAdminNavItems = [
  { href: "/dashboard/admins", label: "Admins", icon: UserCog, exact: false },
];

export function Sidebar({ isOpen = false, onClose, isSuperAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { dateRange } = useDateRange();
  const { data: alerts } = useAlerts(dateRange);
  const criticalCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const totalCount = alerts?.length ?? 0;

  const navItems = isSuperAdmin
    ? [...baseNavItems, ...superAdminNavItems]
    : baseNavItems;

  async function handleLogout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <aside
      className={cn(
        "ac-sidebar flex h-full w-64 shrink-0 flex-col border-r",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
        "md:relative md:translate-x-0",
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

      {/* Footer — logout */}
      <div className="border-t p-3" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <button
          onClick={handleLogout}
          className="ac-sidebar-link flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
