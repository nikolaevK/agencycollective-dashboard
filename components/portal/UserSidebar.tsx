"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, ClipboardCheck, BookOpen, LogOut, X, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgencyLogo } from "@/components/layout/AgencyLogo";

interface UserSidebarProps {
  displayName?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function UserSidebar({ displayName, isOpen = false, onClose }: UserSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Extract slug from URL: "/{slug}/portal/..."
  const slug = pathname.split("/")[1] ?? "";

  // Unread support-message count for the sidebar badge. Polled every 60s,
  // pauses while tab is hidden. Cleared as soon as the user opens the
  // support page (which POSTs /read on mount + on each new poll).
  const { data: unreadSupport = 0 } = useQuery<number>({
    queryKey: ["portal-support-unread"],
    queryFn: async () => {
      const res = await fetch("/api/portal/support/unread");
      if (!res.ok) return 0;
      const json = await res.json();
      return Number(json.data?.count ?? 0);
    },
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
  });

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/?portal=client");
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
      {/* Logo row — AC logo always visible, close button on mobile */}
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

      {/* Account badge — name only */}
      {displayName && (
        <div className="px-5 py-3 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-40 mb-0.5">
            Account
          </p>
          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--sidebar-hover-fg))" }}>
            {displayName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest opacity-40">
          Portal
        </p>
        <Link
          href={`/${slug}/portal/welcome-kit`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/welcome-kit") && "active"
          )}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>Welcome Kit</span>
        </Link>
        <Link
          href={`/${slug}/portal/onboarding`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/onboarding") && "active"
          )}
        >
          <ClipboardCheck className="h-4 w-4 shrink-0" />
          <span>Onboarding</span>
        </Link>
        <Link
          href={`/${slug}/portal/overview`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.endsWith("/portal/overview") && "active"
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>Overview</span>
        </Link>
        <Link
          href={`/${slug}/portal/support`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/support") && "active"
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="flex-1">Support</span>
          {unreadSupport > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold"
              aria-label={`${unreadSupport} unread message${unreadSupport === 1 ? "" : "s"}`}
            >
              {unreadSupport > 99 ? "99+" : unreadSupport}
            </span>
          )}
        </Link>
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
