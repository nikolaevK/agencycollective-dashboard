"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { href: "/dashboard/closers", label: "Overview", exact: true },
  { href: "/dashboard/closers/manage", label: "Manage" },
  { href: "/dashboard/closers/deals", label: "Deals" },
  { href: "/dashboard/closers/calendar", label: "Calendar" },
  { href: "/dashboard/closers/payouts", label: "Payouts" },
  { href: "/dashboard/closers/contracts", label: "Contracts" },
  { href: "/dashboard/closers/ghl-contacts", label: "GHL Contacts" },
];

export function CloserSubNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  // The clicked tab, until its page mounts its own nav — so the pill starts
  // sliding on click instead of after the next page has loaded.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // The tab row scrolls sideways on phones — keep the active tab in view
  // (otherwise e.g. "GHL Contacts" is selected but scrolled off-screen).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  const activeHref =
    tabs.find((tab) => (tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)))?.href ?? "";

  // Route tabs: each trigger is a Link, so navigation (incl. cmd-click /
  // middle-click) stays plain anchor behavior; Tabs only drives the styling.
  return (
    <Tabs value={pendingHref ?? activeHref} className="mb-6 overflow-x-auto">
      <TabsList sliding="closers-subnav">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link
              href={tab.href}
              ref={tab.href === activeHref ? activeRef : undefined}
              onClick={(e) => {
                // New-tab / modified clicks don't navigate this page.
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                setPendingHref(tab.href);
              }}
            >
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
