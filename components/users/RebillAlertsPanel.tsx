"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlertTriangle,
  RefreshCcw,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate } from "./format";

interface RebillAlert {
  id: string;
  slug: string;
  displayName: string;
  logoPath: string | null;
  status: "due" | "overdue";
  nextRebillAt: string | null;
  lastRebilledAt: string | null;
  daysUntilDue: number | null;
  payoutMrr: number;
}

interface ReminderAlert {
  id: string;
  userId: string;
  clientName: string;
  clientSlug: string;
  body: string;
  remindAt: string | null;
}

export interface RebillAlertsData {
  rebills: RebillAlert[];
  reminders: ReminderAlert[];
  count: number;
  overdueCount: number;
}

async function fetchAlerts(): Promise<RebillAlertsData> {
  const res = await fetch("/api/admin/clients/rebill-alerts");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as RebillAlertsData;
}

/**
 * Shared hook — same query key dedupes the page badge + the panel fetch.
 * 10-minute cadence: the endpoint rebuilds the full client directory per
 * call and the schedule engine is day-granular, so minute-level polling
 * buys nothing. Every billing mutation invalidates this key explicitly,
 * so admin actions still refresh the badge immediately.
 */
export function useRebillAlerts() {
  return useQuery({
    queryKey: ["admin-rebill-alerts"],
    queryFn: fetchAlerts,
    staleTime: 600_000,
    refetchInterval: 600_000,
    refetchIntervalInBackground: false,
  });
}

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
  const { data } = useRebillAlerts();

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
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-500/[0.06] overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Bell className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">
            {count} re-bill alert{count !== 1 ? "s" : ""}
            {overdue > 0 && (
              <span className="ml-2 text-red-600 dark:text-red-400">
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
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-amber-500/20 p-3 space-y-2 max-h-[40vh] overflow-y-auto">
          {rebills.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/dashboard/users/${r.id}`)}
              className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-left hover:border-primary/30 transition-colors"
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                  r.status === "overdue"
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                {r.status === "overdue" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
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
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {formatMoney(r.payoutMrr)}
                </span>
              )}
            </button>
          ))}

          {reminders.map((rem) => (
            <button
              key={rem.id}
              onClick={() => router.push(`/dashboard/users/${rem.userId}`)}
              className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-left hover:border-primary/30 transition-colors"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                <CalendarClock className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {rem.clientName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Reminder: {rem.body}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDate(rem.remindAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
