"use client";

import { useState } from "react";
import {
  Zap,
  Unplug,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { BadgeDot, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { PixelHealth, PixelStatsPeriod } from "@/types/dashboard";

interface PixelHealthCardProps {
  pixels?: PixelHealth[];
  isLoading: boolean;
  error?: Error | null;
  periodLabel?: string;
  period?: PixelStatsPeriod;
  onPeriodChange?: (period: PixelStatsPeriod) => void;
}

const PERIOD_OPTIONS: { value: PixelStatsPeriod; label: string }[] = [
  { value: "last_24h", label: "24h" },
  { value: "last_7d", label: "7d" },
  { value: "last_30d", label: "30d" },
];

const KEY_EVENTS = [
  "PageView",
  "Purchase",
  "AddToCart",
  "InitiateCheckout",
  "Lead",
  "ViewContent",
  "CompleteRegistration",
  "Search",
  "AddPaymentInfo",
  "AddToWishlist",
];

function shortenEventName(event: string): string {
  const cleaned = event
    .replace(/^offsite_conversion\.fb_pixel_/i, "")
    .replace(/^fb_pixel_/i, "");
  return cleaned
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

function PixelSection({ pixel, defaultExpanded }: { pixel: PixelHealth; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const sortedStats = [...pixel.eventStats].sort((a, b) => {
    const aKey = KEY_EVENTS.indexOf(shortenEventName(a.event));
    const bKey = KEY_EVENTS.indexOf(shortenEventName(b.event));
    if (aKey !== -1 && bKey !== -1) return aKey - bKey;
    if (aKey !== -1) return -1;
    if (bKey !== -1) return 1;
    return b.count - a.count;
  });

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <div className="flex items-center gap-2 min-w-0">
          <BadgeDot tone={pixel.isActive ? "success" : "danger"} className="size-2" />
          <span className="text-sm font-medium truncate">{pixel.name}</span>
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            {pixel.id}
          </span>
        </div>
        {!defaultExpanded && (
          expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {pixel.lastFiredTime && (
            <p className="text-xs text-muted-foreground">
              Last fired: {formatRelativeTime(pixel.lastFiredTime)}
            </p>
          )}

          {sortedStats.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sortedStats.map((stat) => {
                const name = shortenEventName(stat.event);
                const isKey = KEY_EVENTS.includes(name);
                return (
                  <div
                    key={stat.event}
                    className={cn(
                      "flex items-center justify-between gap-1 rounded-xl px-2.5 py-1.5 text-xs",
                      isKey ? "bg-muted" : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <span className="truncate">{name}</span>
                    <span className="font-medium tabular-nums shrink-0 text-foreground">
                      {formatCount(stat.count)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No event data available</p>
          )}

        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-3 w-24" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function PixelHealthCard({
  pixels,
  isLoading,
  error,
  periodLabel,
  period = "last_7d",
  onPeriodChange,
}: PixelHealthCardProps) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" />
            <CardTitle>Pixel Health</CardTitle>
            {pixels && pixels.length > 0 && (
              <StatusBadge tone={pixels[0].isActive ? "success" : "danger"}>
                {pixels[0].isActive ? "Active" : "Inactive"}
              </StatusBadge>
            )}
          </div>
          {periodLabel && <CardDescription className="text-xs">{periodLabel}</CardDescription>}
        </div>
        {onPeriodChange && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={period}
            onValueChange={(v) => {
              if (v) onPeriodChange(v as PixelStatsPeriod);
            }}
            aria-label="Pixel stats period"
            className="shrink-0"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </CardHeader>

      <CardContent>
        {/* Content */}
        {isLoading && <LoadingSkeleton />}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="size-4" />
            Failed to load pixel data
          </div>
        )}

        {!isLoading && !error && pixels && pixels.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Unplug className="size-6 mb-2 opacity-60" />
            <p className="text-sm">No pixels found for this account</p>
          </div>
        )}

        {!isLoading && !error && pixels && pixels.length > 0 && (
          <div className="space-y-4 divide-y divide-border">
            {pixels.map((pixel, i) => (
              <div key={pixel.id} className={i > 0 ? "pt-4" : ""}>
                <PixelSection pixel={pixel} defaultExpanded={i === 0} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
