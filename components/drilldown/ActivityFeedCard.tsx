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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

// Event kind → icon (neutral, like every icon on the admin pages).
const EVENT_TYPE_CONFIG: Record<string, { icon: typeof Activity }> = {
  campaign: { icon: Megaphone },
  ad: { icon: Image },
  billing: { icon: CreditCard },
  user: { icon: UserCog },
  default: { icon: Settings },
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
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {item.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
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

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border">
        <Icon className={cn("size-3.5", colorClass)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.description}
        </p>
      </div>
      {item.percentChange !== undefined && (
        <Badge variant="outline" tone={isGood ? "success" : "danger"} className="shrink-0 tabular-nums">
          {item.percentChange > 0 ? "+" : ""}
          {item.percentChange}%
        </Badge>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0 divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <Skeleton className="size-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeedCard({ items, isLoading, error }: ActivityFeedCardProps) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <CardTitle>Activity Feed</CardTitle>
        </div>
        {items && items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
      </CardHeader>

      <CardContent>
        {isLoading && <LoadingSkeleton />}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="size-4" />
            Failed to load activity data
          </div>
        )}

        {!isLoading && !error && items && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="size-6 mb-2 opacity-60" />
            <p className="text-sm">No recent activity</p>
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
      </CardContent>
    </Card>
  );
}
