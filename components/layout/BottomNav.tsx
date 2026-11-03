"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, UserCog, Handshake, Megaphone, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/components/providers/AdminProvider";
import type { PermissionKey } from "@/lib/permissions";

const allTabs: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm: PermissionKey }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true, perm: "dashboard" },
  { href: "/dashboard/users", label: "Clients", icon: Users, exact: false, perm: "users" },
  { href: "/dashboard/media-buyers", label: "Media", icon: Megaphone, exact: false, perm: "media" },
  { href: "/dashboard/admins", label: "Admins", icon: UserCog, exact: false, perm: "admin" },
  { href: "/dashboard/closers", label: "Closers", icon: Handshake, exact: false, perm: "closers" },
];

// Kit focus ring (rounded so it hugs the inactive stacked tabs too).
const tabBase =
  "flex items-center gap-1.5 rounded-2xl outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30";

interface BottomNavProps {
  onMenuClick?: () => void;
}

export function BottomNav({ onMenuClick }: BottomNavProps) {
  const pathname = usePathname();
  const admin = useAdmin();

  // Filter tabs by permission
  const tabs = allTabs.filter(
    (tab) => admin.isSuper || admin.permissions[tab.perm] || (tab.perm === "media" && admin.permissions.media_manage)
  );

  // Check if current page is one not in the bottom tabs (i.e. a "More" page)
  const isMoreActive = !tabs.some((tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  );

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden rounded-t-3xl bg-card/80 shadow-[0_-4px_24px_rgba(32,48,68,0.06)] ring-1 ring-foreground/5 backdrop-blur-xl dark:ring-foreground/10"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-4 pt-3 pb-6">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                tabBase,
                isActive
                  ? "rounded-full bg-primary px-3 py-2 text-primary-foreground"
                  : "flex-col text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span
                className={cn(
                  "font-medium",
                  isActive
                    ? "text-[11px]"
                    : "text-[10px] uppercase tracking-wider"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* More / hamburger */}
        <button
          onClick={onMenuClick}
          aria-label="Open more navigation options"
          className={cn(
            tabBase,
            isMoreActive
              ? "rounded-full bg-primary px-3 py-2 text-primary-foreground"
              : "flex-col text-muted-foreground hover:text-foreground"
          )}
        >
          <Menu className="h-5 w-5" />
          <span
            className={cn(
              "font-medium",
              isMoreActive
                ? "text-[11px]"
                : "text-[10px] uppercase tracking-wider"
            )}
          >
            More
          </span>
        </button>
      </div>
    </nav>
  );
}
