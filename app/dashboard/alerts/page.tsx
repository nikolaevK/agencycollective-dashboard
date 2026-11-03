"use client";

import { Suspense } from "react";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { useHydrated } from "@/hooks/useHydrated";
import { DashboardShell } from "@/components/layout/DashboardShell";
import AlertsLoading from "./loading";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { StatCard } from "@/components/overview/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, RotateCw, Bell, AlertTriangle, AlertCircle, Layers } from "lucide-react";
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
  // The error a retry started from. A refetch with no data resets the query to
  // "pending" (error cleared), which used to swap the error card for skeletons
  // and drop the Retry button's focus — keep the card up, retrying, instead.
  const [retryFrom, setRetryFrom] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setRetryFrom(error ? (error as Error).message : null);
    await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    setTimeout(() => setRefreshing(false), 800);
  }

  const feedError = error ? (error as Error).message : refreshing && !alerts ? retryFrom : null;

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
                : feedError !== null && !refreshing
                  ? "Alerts couldn't be checked"
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
        {feedError === null && (
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
        {feedError !== null ? (
          <AlertsErrorState message={feedError} retrying={refreshing} onRetry={handleRefresh} />
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

/**
 * QueryErrorState's look, plus feedback while a retry runs (the alerts query
 * retries with backoff, so a click can take a few seconds to resolve).
 */
function AlertsErrorState({
  message,
  retrying,
  onRetry,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <AlertCircle className="size-6 text-muted-foreground" />
      <div aria-live="polite">
        <p className="text-sm font-medium text-foreground">
          {retrying ? "Checking for alerts again…" : "Couldn't load alerts"}
        </p>
        {!retrying && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
      </div>
      {/* aria-disabled, not disabled: a disabled button would drop the focus. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={retrying ? undefined : onRetry}
        aria-disabled={retrying}
        className="mt-1 aria-disabled:opacity-60"
      >
        <RotateCw className={cn(retrying && "animate-spin")} />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </Card>
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
