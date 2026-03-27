"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CloserBentoGrid } from "@/components/closer/CloserBentoGrid";
import { CloserRecentDeals } from "@/components/closer/CloserRecentDeals";

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
    showRate: number;
    showCount: number;
    noShowCount: number;
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

export default function CloserDashboardPage() {
  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ["closer-stats"],
    queryFn: async () => {
      const res = await fetch("/api/closer/stats");
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <div className="mb-6">
            <div className="h-7 w-48 rounded bg-muted animate-pulse mb-2" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {data.closer.displayName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here&apos;s your sales performance overview
          </p>
        </div>

        {/* Metrics */}
        <CloserBentoGrid
          totalRevenue={data.stats.totalRevenue}
          dealCount={data.stats.dealCount}
          closedCount={data.stats.closedCount}
          avgDealValue={data.stats.avgDealValue}
          showRate={data.stats.showRate}
          showCount={data.stats.showCount}
          noShowCount={data.stats.noShowCount}
          quota={data.closer.quota}
        />

        {/* Recent deals */}
        <CloserRecentDeals deals={data.recentDeals as never[]} />

        {/* Mobile FAB */}
        <Link
          href="/closer/new-deal"
          className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full ac-gradient text-white shadow-lg shadow-primary/25 active:scale-95 transition-transform"
          aria-label="New deal"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </div>
    </main>
  );
}
