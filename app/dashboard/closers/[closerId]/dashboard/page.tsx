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
import { Button } from "@/components/ui/button";

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
        `/api/admin/closers/${closerId}/dashboard-data?trends=1`,
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
    <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
      {/* Sticky "viewing as" banner. */}
      <div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="size-4 text-amber-500 shrink-0" />
            <p className="text-xs font-medium truncate">
              {displayName
                ? `Viewing ${displayName}'s dashboard ${role === "setter" ? "(setter)" : "(closer)"} — read-only`
                : "Viewing dashboard — read-only"}
            </p>
          </div>
          <Button asChild variant="ghost" size="xs" className="shrink-0">
            <Link href={`/dashboard/closers/${closerId}`}>
              <ArrowLeft />
              Back to detail
            </Link>
          </Button>
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
