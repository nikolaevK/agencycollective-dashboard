"use client";

import { useState } from "react";
import {
  Zap,
  Unplug,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              pixel.isActive ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm font-medium truncate">{pixel.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
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
            <p className="text-[11px] text-muted-foreground">
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
                    className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-xs ${
                      isKey
                        ? "bg-primary/8 dark:bg-primary/15"
                        : "bg-muted/50 dark:bg-muted/20"
                    }`}
                  >
                    <span className="truncate text-foreground/80">{name}</span>
                    <span className="font-semibold tabular-nums shrink-0">
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
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-muted/60" />
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
    <div className="bg-card rounded-2xl p-5 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/15">
            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-base lg:font-bold lg:normal-case lg:tracking-normal text-foreground">
              Pixel Health
            </h4>
            {periodLabel && (
              <p className="text-[10px] text-muted-foreground">{periodLabel}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onPeriodChange && (
            <div className="flex rounded-lg border border-border/60 overflow-hidden text-[11px]">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onPeriodChange(opt.value)}
                  className={`px-2 py-1 transition-colors ${
                    period === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {pixels && pixels.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                pixels[0].isActive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {pixels[0].isActive ? "Active" : "Inactive"}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading && <LoadingSkeleton />}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          Failed to load pixel data
        </div>
      )}

      {!isLoading && !error && pixels && pixels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Unplug className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-xs">No pixels found for this account</p>
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
    </div>
  );
}
