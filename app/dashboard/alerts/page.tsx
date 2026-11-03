"use client";

import { Suspense } from "react";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { useHydrated } from "@/hooks/useHydrated";
import { DashboardShell } from "@/components/layout/DashboardShell";
import AlertsLoading from "./loading";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { StatCard } from "@/components/overview/StatCard";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Bell, AlertTriangle, AlertCircle, Layers } from "lucide-react";
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
  const { dateRange, dateQuery } = useDateRange();
  const hydrated = useHydrated();
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

  // The shell may already hold this page's data at hydration (see useHydrated).
  if (!hydrated) return <AlertsLoading />;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Alerts</h2>
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
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Summary cards — skeletons while loading, so the feed doesn't jump */}
        {!error && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Critical" icon={AlertTriangle} isLoading={isLoading} value={String(criticalCount)} />
            <StatCard label="Warning" icon={AlertCircle} isLoading={isLoading} value={String(warningCount)} />
            <StatCard label="Total" icon={Bell} isLoading={isLoading} value={String(alerts?.length ?? 0)} />
            <StatCard
              label="Entities"
              icon={Layers}
              isLoading={isLoading}
              value={String(new Set(alerts?.map((a) => a.entityId)).size)}
            />
          </div>
        )}

        {/* Alert feed */}
        {error ? (
          <QueryErrorState
            title="Couldn't load alerts"
            message={`Failed to load alerts: ${(error as Error).message}`}
            onRetry={handleRefresh}
          />
        ) : (
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
              <CardTitle>
                All Alerts
                {alerts && severityFilter !== "all" && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({alerts.filter((a) => a.severity === severityFilter).length})
                  </span>
                )}
              </CardTitle>
              {/* Plain pressed buttons: a ToggleGroup's roving-focus runtime
                  would be most of this page's JS. */}
              <div role="group" aria-label="Severity" className="flex items-center gap-1">
                {SEVERITY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant="outline"
                    aria-pressed={severityFilter === opt.value}
                    onClick={() => setSeverityFilter(opt.value)}
                    className="aria-pressed:bg-muted aria-pressed:text-foreground"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <AlertFeed
                alerts={severityFilter === "all" ? alerts : alerts?.filter((a) => a.severity === severityFilter)}
                isLoading={isLoading}
                groupBySeverity={severityFilter === "all"}
                compact={false}
                dateQuery={dateQuery}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

export default function AlertsPage() {
  return (
    <Suspense
      fallback={<AlertsLoading />}
    >
      <AlertsContent />
    </Suspense>
  );
}
