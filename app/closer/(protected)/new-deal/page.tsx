"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DealEntryForm } from "@/components/closer/DealEntryForm";
import { DealSidebar } from "@/components/closer/DealSidebar";

interface StatsResponse {
  closer: {
    id: string;
    displayName: string;
    role: string;
    quota: number;
    commissionRate: number;
  };
  stats: {
    totalRevenue: number;
    dealCount: number;
    closedCount: number;
    avgDealValue: number;
  };
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

export default function NewDealPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery<StatsResponse>({
    queryKey: ["closer-stats"],
    queryFn: async () => {
      const res = await fetch("/api/closer/stats");
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
  }

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
              totalRevenue={data?.stats.totalRevenue ?? 0}
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
                    ? `${Math.min(Math.round((data.stats.totalRevenue / data.closer.quota) * 100), 100)}%`
                    : "—"}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full ac-gradient transition-all duration-500"
                  style={{
                    width: `${data.closer.quota > 0 ? Math.min((data.stats.totalRevenue / data.closer.quota) * 100, 100) : 0}%`,
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
