"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowUpRight, Info, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Lazy: the popover runtime (Radix + floating-ui) lands in every page chunk
// that imports it statically (measured +15–27 kB First Load). Pages whose
// cards explain no metric never load it; the icon holds its place meanwhile.
const StatInfo = dynamic(() => import("@/components/overview/StatInfo").then((m) => m.StatInfo), {
  loading: () => (
    <span className="-m-1.5 shrink-0 p-1.5 text-muted-foreground/60">
      <Info className="size-3.5" />
    </span>
  ),
});

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  value: string;
  /** Δ chip next to the value (TrendDelta). */
  delta?: React.ReactNode;
  sub?: React.ReactNode;
  /** What the metric means — behind an info button (cards without `href`). */
  info?: string;
  /** The whole card opens the page this number comes from. */
  href?: string;
  isLoading?: boolean;
  className?: string;
  /** E.g. hide the decorative icon at widths where the label needs its room. */
  iconClassName?: string;
  /** Footer, e.g. a MetricSparkline (it must be the last child). */
  children?: React.ReactNode;
}

/**
 * Metric card in the Closers-page style: label + icon, the number with its
 * Δ chip, a muted subtitle and an optional trend footer. With `href` the
 * card is a link to the page that number comes from.
 */
export function StatCard({
  label,
  icon: Icon,
  value,
  delta,
  sub,
  info,
  href,
  isLoading,
  className,
  iconClassName,
  children,
}: StatCardProps) {
  const card = (
    <Card className={cn("flex h-full min-w-0 flex-col", href && "transition-colors group-hover:bg-muted/50", !href && className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
        <div className="flex min-w-0 items-center gap-1">
          <CardDescription className="truncate">{label}</CardDescription>
          {href && (
            <ArrowUpRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          )}
          {info && !href && <StatInfo label={label} info={info} />}
        </div>
        <Icon className={cn("size-4 shrink-0 text-muted-foreground", iconClassName)} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-32" />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl" title={value}>
                {value}
              </div>
              {delta}
            </div>
            {sub && <p className="line-clamp-2 text-xs text-muted-foreground">{sub}</p>}
          </>
        )}
        {children}
      </CardContent>
    </Card>
  );

  if (!href) return card;
  // An in-page jump ("#meta-ads") is a plain anchor — no route prefetch.
  const Anchor = href.startsWith("#") ? "a" : Link;
  return (
    <Anchor
      href={href}
      className={cn(
        "group block min-w-0 rounded-[min(calc(var(--radius)*2.6),24px)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        className
      )}
    >
      {card}
    </Anchor>
  );
}
