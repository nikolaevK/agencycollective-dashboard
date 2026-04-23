"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, PlusCircle, CalendarDays, LogOut, X, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CloserRole } from "@/lib/closers";
import { AgencyLogo } from "@/components/layout/AgencyLogo";

interface CloserSidebarProps {
  displayName?: string;
  role?: CloserRole;
  isOpen?: boolean;
  onClose?: () => void;
}

const CLOSER_NAV = [
  { href: "/closer/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/closer/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/closer/new-deal", label: "New Deal", icon: PlusCircle },
  { href: "/closer/notes", label: "Notes", icon: StickyNote },
];

const SETTER_NAV = [
  { href: "/closer/setter", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/closer/setter/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/closer/setter/notes", label: "Notes", icon: StickyNote },
];

export function CloserSidebar({ displayName, role, isOpen = false, onClose }: CloserSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSetter = role === "setter";
  const navItems = isSetter ? SETTER_NAV : CLOSER_NAV;

  async function handleLogout() {
    await fetch("/api/auth/closer/logout", { method: "POST" });
    router.push("/?portal=closer");
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
      {/* Logo row */}
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

      {/* Account badge */}
      {displayName && (
        <div className="px-5 py-3 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-40 mb-0.5">
            {isSetter ? "Setter" : "Closer"}
          </p>
          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--sidebar-hover-fg))" }}>
            {displayName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest opacity-40">
          {isSetter ? "Appointments" : "Sales"}
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
              className={cn(
                "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium mb-0.5",
                isActive && "active"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
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
