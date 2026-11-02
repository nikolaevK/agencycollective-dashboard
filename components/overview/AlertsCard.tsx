"use client";

import { Bell } from "lucide-react";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { CardLink } from "@/components/overview/CardLink";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Alert } from "@/types/alerts";

/** The latest Meta alerts, each linking to its campaign / account. */
export function AlertsCard({
  alerts,
  isLoading,
  isError,
  dateQuery,
}: {
  alerts?: Alert[];
  isLoading?: boolean;
  isError?: boolean;
  /** Carried into the links ("preset=last_7d"). */
  dateQuery?: string;
}) {
  const critical = alerts?.filter((a) => a.severity === "critical").length ?? 0;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <CardTitle>Alerts</CardTitle>
          {alerts && alerts.length > 0 && (
            <Badge
              variant="outline"
              tone={critical > 0 ? "danger" : "warning"}
              aria-label={`${alerts.length} alert${alerts.length === 1 ? "" : "s"}, ${critical} critical`}
              title={`${critical} critical`}
            >
              {alerts.length}
            </Badge>
          )}
        </div>
        <CardLink href={`/dashboard/alerts${dateQuery ? `?${dateQuery}` : ""}`}>All alerts</CardLink>
      </CardHeader>
      <CardContent className="flex-1">
        {isError && !alerts ? (
          // Not "All clear": a failed check isn't a clean bill of health.
          <p className="py-12 text-center text-sm text-muted-foreground">Couldn&apos;t load alerts.</p>
        ) : (
          <AlertFeed alerts={alerts} isLoading={isLoading} groupBySeverity={false} compact maxItems={4} dateQuery={dateQuery} />
        )}
      </CardContent>
    </Card>
  );
}
