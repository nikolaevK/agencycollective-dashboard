"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CalendarClock,
  AlertCircle,
  Loader2,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDate } from "./format";
import { useRebillAlerts } from "./useRebillAlerts";

// The hook lives in its own module so a page can read the alerts without
// bundling this panel; re-exported for existing importers.
export { useRebillAlerts, type RebillAlertsData } from "./useRebillAlerts";

const ROW =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30";

export function RebillAlertsPanel({
  open,
  onOpenChange,
  restrictToUserIds = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace context: when set, only alerts for these client ids render
   *  (the page's workspace selector scopes every number on the page). */
  restrictToUserIds?: Set<string> | null;
}) {
  const router = useRouter();
  const { data, isError, isFetching, refetch } = useRebillAlerts();

  // A failed load must not read as "nothing due" (the panel used to vanish
  // and the summary card showed 0) — same treatment as SentInvoicesPanel.
  if (isError && !data) {
    return (
      <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
        <AlertCircle className="size-4 shrink-0" />
        <p className="flex-1 min-w-0">
          Couldn&rsquo;t load re-bill alerts.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0"
        >
          {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
          Retry
        </Button>
      </div>
    );
  }

  const rebills = (data?.rebills ?? []).filter(
    (r) => !restrictToUserIds || restrictToUserIds.has(r.id)
  );
  const reminders = (data?.reminders ?? []).filter(
    (rem) => !restrictToUserIds || restrictToUserIds.has(rem.userId)
  );
  const count = rebills.length + reminders.length;
  if (count === 0) return null;

  const overdue = rebills.filter((r) => r.status === "overdue").length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 md:px-6"
      >
        <Bell className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {count} re-bill alert{count !== 1 ? "s" : ""}
            {overdue > 0 && (
              <span className="ml-2 text-red-700 dark:text-red-400">
                · {overdue} overdue
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Clients due for re-billing and due reminders
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <ul className="max-h-[40vh] space-y-0.5 overflow-y-auto border-t p-2 md:px-4">
          {rebills.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/users/${r.id}`)}
                className={ROW}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.status === "overdue"
                      ? `Overdue since ${formatDate(r.nextRebillAt)}`
                      : `Due ${formatDate(r.nextRebillAt)}`}
                    {r.daysUntilDue != null &&
                      ` · ${
                        r.daysUntilDue < 0
                          ? `${Math.abs(r.daysUntilDue)}d late`
                          : `in ${r.daysUntilDue}d`
                      }`}
                  </p>
                </div>
                {r.payoutMrr > 0 && (
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {formatMoney(r.payoutMrr)}
                  </span>
                )}
                <StatusBadge tone={r.status === "overdue" ? "danger" : "warning"} className="shrink-0">
                  {r.status === "overdue" ? "Overdue" : "Due"}
                </StatusBadge>
              </button>
            </li>
          ))}

          {reminders.map((rem) => (
            <li key={rem.id}>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/users/${rem.userId}`)}
                className={ROW}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {rem.clientName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Reminder: {rem.body}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  {formatDate(rem.remindAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
