"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard/closers", label: "Overview", exact: true },
  { href: "/dashboard/closers/manage", label: "Manage" },
  { href: "/dashboard/closers/deals", label: "Deals" },
  { href: "/dashboard/closers/calendar", label: "Calendar" },
];

export function CloserSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 dark:bg-white/5 p-1 mb-6">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
