"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle } from "lucide-react";
import { CardLink } from "@/components/overview/CardLink";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/format";
import type { RebillAlertsData } from "@/components/users/useRebillAlerts";

const SHOWN = 5;

function dueText(daysUntilDue: number | null, status: "due" | "overdue"): string {
  if (daysUntilDue == null) return status === "overdue" ? "Overdue" : "Due";
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d late`;
  if (daysUntilDue === 0) return "Due today";
  return `Due in ${daysUntilDue}d`;
}

/** Active clients whose re-bill is due or overdue (Client Directory alerts),
 *  each opening the client's Billing tab. */
export function RebillsDueCard({
  data,
  isLoading,
  isError,
}: {
  data?: RebillAlertsData;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const rebills = data?.rebills ?? [];
  const atStake = rebills.reduce((s, r) => s + r.payoutMrr, 0);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <CardTitle>Re-bills Due</CardTitle>
          {rebills.length > 0 && <Badge variant="secondary">{rebills.length}</Badge>}
        </div>
        <CardLink href="/dashboard/users">Clients</CardLink>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : isError && !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load re-bill alerts.</p>
        ) : rebills.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <CheckCircle className="size-6 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-muted-foreground">No re-bills due right now.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {data && data.overdueCount > 0 && (
                <span className="font-medium text-red-700 dark:text-red-400">{data.overdueCount} overdue · </span>
              )}
              {formatCents(atStake)} MRR to bill
            </p>
            <ul className="-mx-2 space-y-0.5">
              {rebills.slice(0, SHOWN).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/users/${r.id}?tab=billing`}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.displayName}</p>
                      <p className="text-xs text-muted-foreground">{dueText(r.daysUntilDue, r.status)}</p>
                    </div>
                    {r.payoutMrr > 0 && (
                      <span className="shrink-0 text-sm tabular-nums">{formatCents(r.payoutMrr)}</span>
                    )}
                    <StatusBadge tone={r.status === "overdue" ? "danger" : "warning"} className="shrink-0">
                      {r.status === "overdue" ? "Overdue" : "Due"}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
            {rebills.length > SHOWN && (
              <Link
                href="/dashboard/users"
                className="mt-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                +{rebills.length - SHOWN} more in Clients
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
