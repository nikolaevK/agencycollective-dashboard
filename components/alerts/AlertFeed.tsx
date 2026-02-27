"use client";

import { AlertCard } from "./AlertCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Alert, AlertSeverity } from "@/types/alerts";
import { AlertTriangle, CheckCircle } from "lucide-react";

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
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <CheckCircle className="h-8 w-8 text-green-500 opacity-70" />
        <p className="text-sm font-medium">All clear — no active alerts</p>
        <p className="text-xs">Performance looks healthy across all accounts</p>
      </div>
    );
  }

  const displayedAlerts = maxItems ? alerts.slice(0, maxItems) : alerts;

  if (!groupBySeverity) {
    return (
      <div className="space-y-3">
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

  return (
    <div className="space-y-6">
      {SEVERITY_ORDER.map((severity) => {
        const group = grouped[severity];
        if (group.length === 0) return null;

        const colors = {
          critical: "text-red-600",
          warning: "text-yellow-600",
          info: "text-blue-600",
        };

        return (
          <div key={severity}>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${colors[severity]}`} />
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${colors[severity]}`}>
                {severity} ({group.length})
              </h3>
            </div>
            <div className="space-y-3">
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
