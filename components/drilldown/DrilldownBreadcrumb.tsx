"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useDateRange } from "@/hooks/useDateRange";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DrilldownBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/** Overview › account › campaign › ad set. Links keep the selected date range. */
export function DrilldownBreadcrumb({ items, className }: DrilldownBreadcrumbProps) {
  const { dateQuery } = useDateRange();
  const withRange = (href: string) => (dateQuery ? `${href}?${dateQuery}` : href);
  const crumbs: BreadcrumbItem[] = [{ label: "Overview", href: "/dashboard" }, ...items];

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((item, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn("max-w-[160px] truncate md:max-w-xs", isLast && "text-foreground")}
                  title={item.label}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={withRange(item.href)}
                  className="-my-1.5 max-w-[160px] truncate rounded-sm py-1.5 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 md:max-w-xs"
                  title={item.label}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
