"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import {
  CloserDashboardView,
  type CloserDashboardData,
} from "@/components/closer/CloserDashboardView";
import {
  SetterDashboardView,
  type SetterDashboardData,
} from "@/components/closer/SetterDashboardView";
import {
  DashboardSkeleton,
  DashboardError,
} from "@/components/closer/DashboardSkeleton";

type DashboardEnvelope =
  | { role: "closer"; payload: CloserDashboardData }
  | { role: "setter"; payload: SetterDashboardData };

/**
 * Admin "view as user" surface — renders the closer or setter dashboard
 * exactly as the user sees it, scoped to whichever closer is named in the
 * route. Polls every 2 minutes for live data.
 *
 * Read-only by design: the admin a_sess can't satisfy the c_sess-gated
 * mutation endpoints anyway, so we hide the FAB / appointment editor /
 * portal nav links instead of shipping buttons that 401.
 */
export default function AdminCloserDashboardViewPage() {
  const { closerId } = useParams<{ closerId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["admin-view-dashboard", closerId] as const;

  const { data, isError, error } = useQuery<DashboardEnvelope>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/closers/${closerId}/dashboard-data`);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "User not found."
            : `Failed to load dashboard: ${res.status}`
        );
      }
      const json = await res.json();
      return json.data;
    },
    // Same 2-min cadence as the user-facing dashboards; polling keeps the
    // admin view live as the user works.
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: !!closerId,
  });

  const role = data?.role;
  const displayName =
    data?.role === "setter" ? data.payload.setter.displayName : data?.payload.closer.displayName;

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      {/* Sticky "viewing as" banner so the admin always knows the context. */}
      <div className="sticky top-0 z-30 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur supports-[backdrop-filter]:bg-amber-500/[0.08]">
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200 truncate">
              {displayName
                ? `Viewing ${displayName}'s dashboard ${role === "setter" ? "(setter)" : "(closer)"} — read-only`
                : "Viewing dashboard — read-only"}
            </p>
          </div>
          <Link
            href={`/dashboard/closers/${closerId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-200 hover:underline shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to detail
          </Link>
        </div>
      </div>

      {isError ? (
        <DashboardError
          message={
            error instanceof Error
              ? error.message
              : "Failed to load this dashboard."
          }
        />
      ) : !data ? (
        // Setter view tends to use 6 stat tiles, closer 4. We don't know
        // role yet on first paint, so split the difference at 6 — the
        // skeleton is meant to fill space, not match exact final shape.
        <DashboardSkeleton tiles={6} />
      ) : data.role === "setter" ? (
        <SetterDashboardView
          data={data.payload}
          readOnly
          onMutated={() => queryClient.invalidateQueries({ queryKey })}
        />
      ) : (
        <CloserDashboardView data={data.payload} readOnly />
      )}
    </main>
  );
}
