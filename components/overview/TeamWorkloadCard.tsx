"use client";

import { ListTodo } from "lucide-react";
import { CardLink } from "@/components/overview/CardLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TeamDirectoryPayload } from "@/components/team/types";

interface Row {
  label: string;
  value: number;
  hint: string;
  /** Non-zero needs attention (amber/red number). */
  alert?: "warning" | "danger";
}

/** Team hub workload: tasks and inbox items that need someone, plus active
 *  clients missing a team or an MRR. */
export function TeamWorkloadCard({
  team,
  isLoading,
  isError,
  className,
}: {
  team?: TeamDirectoryPayload;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
}) {
  const t = team?.totals;
  const rows: Row[] = t
    ? [
        { label: "Overdue tasks", value: t.tasksOverdue, hint: "Past their due date", alert: "danger" },
        { label: "Due this week", value: t.tasksDueInWindow, hint: "Including overdue" },
        { label: "Unsolved action items", value: t.unsolvedActionItems, hint: "Waiting in members' inboxes", alert: "warning" },
        ...(team?.viewer.selfOnly
          ? []
          : [
              { label: "Clients without a team", value: t.unassignedActive, hint: "Active, nobody assigned", alert: "warning" as const },
              { label: "Clients without MRR", value: t.zeroMrrActive, hint: "Active, $0 MRR", alert: "warning" as const },
            ]),
      ]
    : [];

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-muted-foreground" />
            <CardTitle>Team Workload</CardTitle>
          </div>
          <CardDescription className="text-xs">{team?.viewer.selfOnly ? "Your tasks" : "This week"}</CardDescription>
        </div>
        <CardLink href="/dashboard/team">Team hub</CardLink>
      </CardHeader>
      <CardContent className="flex-1">
        {isError && !t ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load the Team hub.</p>
        ) : isLoading || !t ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm">{r.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.hint}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-lg font-semibold tabular-nums",
                    r.value > 0 && r.alert === "danger" && "text-red-700 dark:text-red-400",
                    r.value > 0 && r.alert === "warning" && "text-amber-700 dark:text-amber-400"
                  )}
                >
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
