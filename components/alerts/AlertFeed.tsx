"use client";

import { AlertCard } from "./AlertCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Alert, AlertSeverity } from "@/types/alerts";
import { CheckCircle } from "lucide-react";

const SEVERITY_ORDER: AlertSeverity[] = ["critical", "warning", "info"];

interface AlertFeedProps {
  alerts?: Alert[];
  isLoading?: boolean;
  groupBySeverity?: boolean;
  compact?: boolean;
  maxItems?: number;
}

export function AlertFeed({
  alerts,
  isLoading,
  groupBySeverity = true,
  compact = false,
  maxItems,
}: AlertFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 rounded-xl bg-muted/40">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <CheckCircle className="h-8 w-8 text-emerald-500 opacity-70" />
        <p className="text-sm font-medium">All clear — no active alerts</p>
        <p className="text-xs">Performance looks healthy across all accounts</p>
      </div>
    );
  }

  const displayedAlerts = maxItems ? alerts.slice(0, maxItems) : alerts;

  if (!groupBySeverity) {
    return (
      <div className="space-y-4">
        {displayedAlerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} compact={compact} />
        ))}
      </div>
    );
  }

  // Group by severity
  const grouped = SEVERITY_ORDER.reduce<Record<AlertSeverity, Alert[]>>(
    (acc, severity) => {
      acc[severity] = displayedAlerts.filter((a) => a.severity === severity);
      return acc;
    },
    { critical: [], warning: [], info: [] }
  );

  const textColors = {
    critical: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  const dotColors = {
    critical: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  return (
    <div className="space-y-6">
      {SEVERITY_ORDER.map((severity) => {
        const group = grouped[severity];
        if (group.length === 0) return null;

        return (
          <div key={severity}>
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className={`block h-2 w-2 rounded-full ${dotColors[severity]}`} />
              <h3 className={`text-xs font-bold uppercase tracking-wide ${textColors[severity]}`}>
                {severity} ({group.length})
              </h3>
            </div>
            <div className="space-y-4">
              {group.map((alert) => (
                <AlertCard key={alert.id} alert={alert} compact={compact} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
