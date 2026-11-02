"use client";

import { AlertCard } from "./AlertCard";
import { BadgeDot, type BadgeTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Alert, AlertSeverity } from "@/types/alerts";
import { CheckCircle } from "lucide-react";

const SEVERITY_ORDER: AlertSeverity[] = ["critical", "warning", "info"];

const GROUP: Record<AlertSeverity, { label: string; tone: BadgeTone }> = {
  critical: { label: "Critical", tone: "danger" },
  warning: { label: "Warning", tone: "warning" },
  info: { label: "Info", tone: "info" },
};

interface AlertFeedProps {
  alerts?: Alert[];
  isLoading?: boolean;
  groupBySeverity?: boolean;
  compact?: boolean;
  maxItems?: number;
  /** Carried into each alert's link ("preset=last_7d"). */
  dateQuery?: string;
}

export function AlertFeed({
  alerts,
  isLoading,
  groupBySeverity = true,
  compact = false,
  maxItems,
  dateQuery,
}: AlertFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border p-4">
            <Skeleton className="size-4 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <CheckCircle className="size-6 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium">All clear — no active alerts</p>
        <p className="text-xs text-muted-foreground">Performance looks healthy across all accounts</p>
      </div>
    );
  }

  const displayedAlerts = maxItems ? alerts.slice(0, maxItems) : alerts;

  if (!groupBySeverity) {
    return (
      <div className="space-y-3">
        {displayedAlerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} compact={compact} dateQuery={dateQuery} />
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

  return (
    <div className="space-y-6">
      {SEVERITY_ORDER.map((severity) => {
        const group = grouped[severity];
        if (group.length === 0) return null;

        return (
          <div key={severity}>
            <div className="mb-3 flex items-center gap-2">
              <BadgeDot tone={GROUP[severity].tone} />
              <h3 className="text-sm font-medium">
                {GROUP[severity].label}
                <span className="ml-1.5 text-muted-foreground tabular-nums">{group.length}</span>
              </h3>
            </div>
            <div className="space-y-3">
              {group.map((alert) => (
                <AlertCard key={alert.id} alert={alert} compact={compact} dateQuery={dateQuery} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
