"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Home, ClipboardCheck, BookOpen, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function PortalBottomNav() {
  const pathname = usePathname();
  const slug = pathname.split("/")[1] ?? "";

  // Same query key + cadence as UserSidebar's badge — deduped by React Query,
  // so this adds no extra polling. On phones the bottom nav is the only
  // always-visible chrome, so unread support replies must surface here.
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

  const tabs = [
    { href: `/${slug}/portal/welcome-kit`, label: "Kit", icon: BookOpen, match: "/portal/welcome-kit", badge: 0 },
    { href: `/${slug}/portal/onboarding`, label: "Onboarding", icon: ClipboardCheck, match: "/portal/onboarding", badge: 0 },
    { href: `/${slug}/portal/overview`, label: "Home", icon: Home, match: "/portal/overview", badge: 0 },
    { href: `/${slug}/portal/support`, label: "Support", icon: MessageSquare, match: "/portal/support", badge: unreadSupport },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden rounded-t-3xl backdrop-blur-xl bg-white/80 dark:bg-card/80 shadow-[0_-4px_24px_rgba(32,48,68,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-4 pt-3 pb-6">
        {tabs.map((tab) => {
          const isActive = pathname.includes(tab.match);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex items-center gap-1.5 transition-colors",
                isActive
                  ? "bg-gradient-to-br from-primary to-[#7c3aed] text-white rounded-xl px-4 py-2"
                  : "flex-col text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span
                className={cn(
                  "font-medium",
                  isActive
                    ? "text-[11px] uppercase tracking-wider"
                    : "text-[10px] uppercase tracking-wider mt-1"
                )}
              >
                {tab.label}
              </span>
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
