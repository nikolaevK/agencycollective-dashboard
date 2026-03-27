"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardCheck, BookOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function PortalBottomNav() {
  const pathname = usePathname();
  const slug = pathname.split("/")[1] ?? "";

  const tabs = [
    { href: `/${slug}/portal/overview`, label: "Home", icon: Home, match: "/portal/overview" },
    { href: `/${slug}/portal/onboarding`, label: "Onboarding", icon: ClipboardCheck, match: "/portal/onboarding" },
    { href: `/${slug}/portal/welcome-kit`, label: "Kit", icon: BookOpen, match: "/portal/welcome-kit" },
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
                "flex items-center gap-1.5 transition-colors",
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
            </Link>
          );
        })}

        {/* Profile placeholder */}
        <button
          className="flex flex-col items-center text-muted-foreground transition-colors"
        >
          <User className="h-5 w-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider mt-1">
            Profile
          </span>
        </button>
      </div>
    </nav>
  );
}
