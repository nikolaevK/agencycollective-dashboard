"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DrilldownBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function DrilldownBreadcrumb({ items, className }: DrilldownBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex flex-wrap items-center gap-1 text-xs md:text-sm", className)}
    >
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            {isLast || !item.href ? (
              <span
                className={cn(
                  "truncate max-w-[140px] md:max-w-xs",
                  isLast
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
                title={item.label}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground truncate max-w-[140px] md:max-w-xs"
                title={item.label}
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
