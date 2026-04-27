"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DealEntryForm } from "@/components/closer/DealEntryForm";
import { DealSidebar } from "@/components/closer/DealSidebar";
import type { CloserDealStats } from "@/lib/deals";
import { appendTimeFrameParams, buildTimeFrame } from "@/lib/timeFrame";

interface StatsResponse {
  closer: {
    id: string;
    displayName: string;
    role: string;
    quota: number;
    commissionRate: number;
  };
  stats: CloserDealStats;
  recentDeals: Array<{
    id: string;
    closerId: string;
    clientName: string;
    clientUserId: string | null;
    dealValue: number;
    serviceCategory: string | null;
    closingDate: string | null;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

// Quota is a monthly target, so progress should be measured against
// THIS-MONTH closed revenue, not lifetime. This page hardcodes the window
// rather than exposing a selector — there's nowhere on the form to pivot.
const MONTH_FRAME = buildTimeFrame("month");

export default function NewDealPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery<StatsResponse>({
    queryKey: ["closer-stats", "month-progress", MONTH_FRAME.since, MONTH_FRAME.until],
    queryFn: async () => {
      const url = appendTimeFrameParams("/api/closer/stats", MONTH_FRAME);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load stats: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
  }

  // closedRevenue THIS MONTH — what counts toward the monthly quota.
  const monthRevenue = data?.stats.window.closedRevenue ?? 0;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Record New Deal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Streamline your closing data and track your progress
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main form */}
          <div className="lg:col-span-8">
            <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
              <DealEntryForm onSuccess={handleSuccess} />
            </div>
          </div>

          {/* Right sidebar - desktop only */}
          <div className="hidden lg:block lg:col-span-4">
            <DealSidebar
              quota={data?.closer.quota ?? 0}
              totalRevenue={monthRevenue}
              recentDeals={
                (data?.recentDeals ?? [])
                  .filter((d) => d.status === "closed")
                  .slice(0, 3)
                  .map((d) => ({
                    id: d.id,
                    clientName: d.clientName,
                    dealValue: d.dealValue,
                    status: d.status,
                    createdAt: d.createdAt,
                  }))
              }
            />
          </div>
        </div>

        {/* Mobile progress card */}
        <div className="lg:hidden mt-6">
          {data && (
            <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">Monthly Target</span>
                <span className="text-xs text-muted-foreground">
                  {data.closer.quota > 0
                    ? `${Math.min(Math.round((monthRevenue / data.closer.quota) * 100), 100)}%`
                    : "—"}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full ac-gradient transition-all duration-500"
                  style={{
                    width: `${data.closer.quota > 0 ? Math.min((monthRevenue / data.closer.quota) * 100, 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
