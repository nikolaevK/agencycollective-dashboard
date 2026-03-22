"use client";

import {
  Activity,
  Megaphone,
  Image,
  CreditCard,
  UserCog,
  Settings,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import type { ActivityFeedItem } from "@/types/dashboard";

interface ActivityFeedCardProps {
  items?: ActivityFeedItem[];
  isLoading: boolean;
  error?: Error | null;
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

const EVENT_TYPE_CONFIG: Record<
  string,
  { icon: typeof Activity; color: string; bgColor: string }
> = {
  campaign: {
    icon: Megaphone,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10 dark:bg-blue-500/15",
  },
  ad: {
    icon: Image,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-500/10 dark:bg-violet-500/15",
  },
  billing: {
    icon: CreditCard,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10 dark:bg-amber-500/15",
  },
  user: {
    icon: UserCog,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10 dark:bg-green-500/15",
  },
  default: {
    icon: Settings,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50 dark:bg-muted/20",
  },
};

function getEventConfig(eventType?: string) {
  if (!eventType) return EVENT_TYPE_CONFIG.default;
  const lower = eventType.toLowerCase();
  if (lower.includes("campaign")) return EVENT_TYPE_CONFIG.campaign;
  if (lower.includes("ad_set") || lower.includes("adset")) return EVENT_TYPE_CONFIG.ad;
  if (lower.includes("ad")) return EVENT_TYPE_CONFIG.ad;
  if (lower.includes("billing") || lower.includes("funding")) return EVENT_TYPE_CONFIG.billing;
  if (lower.includes("user") || lower.includes("role")) return EVENT_TYPE_CONFIG.user;
  return EVENT_TYPE_CONFIG.default;
}

function MetaActivityItem({ item }: { item: ActivityFeedItem }) {
  const config = getEventConfig(item.eventType);
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 px-1 py-3">
      <div className={`p-1.5 rounded-lg ${config.bgColor} shrink-0 mt-0.5`}>
        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{item.title}</p>
        {item.description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {item.description}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>
    </div>
  );
}

function PerformanceShiftItem({ item }: { item: ActivityFeedItem }) {
  const isPositive = item.direction === "up";
  const Icon = isPositive ? TrendingUp : TrendingDown;

  // Determine if this shift is "good" or "bad"
  // For spend/cpc: up is bad, down is good
  // For roas/ctr/conversions: up is good, down is bad
  const invertedMetrics = ["spend", "cpc"];
  const isGood = invertedMetrics.includes(item.metric ?? "")
    ? !isPositive
    : isPositive;

  const colorClass = isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  const bgClass = isGood
    ? "bg-emerald-500/10 dark:bg-emerald-500/15"
    : "bg-red-500/10 dark:bg-red-500/15";

  return (
    <div className="flex items-start gap-3 px-1 py-3">
      <div className={`p-1.5 rounded-lg ${bgClass} shrink-0 mt-0.5`}>
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{item.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {item.description}
        </p>
      </div>
      {item.percentChange !== undefined && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums shrink-0 ${bgClass} ${colorClass}`}
        >
          {item.percentChange > 0 ? "+" : ""}
          {item.percentChange}%
        </span>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0 divide-y divide-border animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-1 py-3">
          <div className="h-7 w-7 rounded-lg bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-2.5 w-1/2 rounded bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeedCard({ items, isLoading, error }: ActivityFeedCardProps) {
  return (
    <div className="bg-card rounded-2xl p-5 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-primary/15">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-base lg:font-bold lg:normal-case lg:tracking-normal text-foreground">
            Activity Feed
          </h4>
        </div>
        {items && items.length > 0 && (
          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
            {items.length}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading && <LoadingSkeleton />}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          Failed to load activity data
        </div>
      )}

      {!isLoading && !error && items && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Activity className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-xs">No recent activity</p>
        </div>
      )}

      {!isLoading && !error && items && items.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
          {items.map((item) =>
            item.type === "performance_shift" ? (
              <PerformanceShiftItem key={item.id} item={item} />
            ) : (
              <MetaActivityItem key={item.id} item={item} />
            )
          )}
        </div>
      )}
    </div>
  );
}
