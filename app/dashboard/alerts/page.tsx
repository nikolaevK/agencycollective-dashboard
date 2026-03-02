"use client";

import { Suspense } from "react";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";

type SeverityFilter = "all" | "critical" | "warning";

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
];

function AlertsContent() {
  const { dateRange } = useDateRange();
  const { data: alerts, isLoading, error, dataUpdatedAt } = useAlerts(dateRange);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    setTimeout(() => setRefreshing(false), 800);
  }

  const criticalCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const warningCount = alerts?.filter((a) => a.severity === "warning").length ?? 0;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Alerts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {alerts
                ? `${alerts.length} active alert${alerts.length !== 1 ? "s" : ""}`
                : "Checking for alerts..."}
              {dataUpdatedAt > 0 && (
                <span className="ml-2">
                  · Last checked {new Date(dataUpdatedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors",
              refreshing && "opacity-50 cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        {!isLoading && alerts && alerts.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Critical</p>
              <p className="text-3xl font-bold text-red-500">{criticalCount}</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Warning</p>
              <p className="text-3xl font-bold text-amber-500">{warningCount}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-3xl font-bold">{alerts.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entities</p>
              <p className="text-3xl font-bold">
                {new Set(alerts.map((a) => a.entityId)).size}
              </p>
            </div>
          </div>
        )}

        {/* Alert feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              All Alerts
              {alerts && severityFilter !== "all" && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({alerts.filter((a) => a.severity === severityFilter).length})
                </span>
              )}
            </CardTitle>
            <div className="flex items-center rounded-lg border border-input bg-background p-0.5 gap-0.5">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSeverityFilter(opt.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    severityFilter === opt.value
                      ? opt.value === "critical"
                        ? "bg-red-500 text-white shadow-sm"
                        : opt.value === "warning"
                        ? "bg-amber-500 text-white shadow-sm"
                        : "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-destructive text-sm">
                Failed to load alerts: {(error as Error).message}
              </div>
            ) : (
              <AlertFeed
                alerts={severityFilter === "all" ? alerts : alerts?.filter((a) => a.severity === severityFilter)}
                isLoading={isLoading}
                groupBySeverity={severityFilter === "all"}
                compact={false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

export default function AlertsPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="animate-pulse text-muted-foreground">Loading alerts...</div>
        </DashboardShell>
      }
    >
      <AlertsContent />
    </Suspense>
  );
}
