"use client";

import { useState } from "react";
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
import { appendTimeFrameParams, buildTimeFrame, type TimeFrame } from "@/lib/timeFrame";

type DashboardEnvelope =
  | { role: "closer"; payload: CloserDashboardData }
  | { role: "setter"; payload: SetterDashboardData };

export default function AdminCloserDashboardViewPage() {
  const { closerId } = useParams<{ closerId: string }>();
  const queryClient = useQueryClient();
  const [timeFrame, setTimeFrame] = useState<TimeFrame>(() => buildTimeFrame("month"));
  const queryKey = [
    "admin-view-dashboard",
    closerId,
    timeFrame.key,
    timeFrame.since ?? "",
    timeFrame.until ?? "",
  ];

  const { data, isError, error } = useQuery<DashboardEnvelope>({
    queryKey,
    queryFn: async () => {
      const url = appendTimeFrameParams(
        `/api/admin/closers/${closerId}/dashboard-data`,
        timeFrame
      );
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          res.status === 404 ? "User not found." : `Failed to load dashboard: ${res.status}`
        );
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: !!closerId,
  });

  const role = data?.role;
  const displayName =
    data?.role === "setter" ? data.payload.setter.displayName : data?.payload.closer.displayName;

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      {/* Sticky "viewing as" banner. */}
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
          message={error instanceof Error ? error.message : "Failed to load this dashboard."}
        />
      ) : !data ? (
        <DashboardSkeleton tiles={6} />
      ) : data.role === "setter" ? (
        <SetterDashboardView
          data={data.payload}
          timeFrame={timeFrame}
          onTimeFrameChange={setTimeFrame}
          readOnly
          onMutated={() => queryClient.invalidateQueries({ queryKey })}
        />
      ) : (
        <CloserDashboardView
          data={data.payload}
          timeFrame={timeFrame}
          onTimeFrameChange={setTimeFrame}
          readOnly
        />
      )}
    </main>
  );
}
