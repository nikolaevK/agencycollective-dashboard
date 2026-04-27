"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserDetailMetrics } from "@/components/closers/CloserDetailMetrics";
import { CloserPerformanceChart } from "@/components/closers/CloserPerformanceChart";
import { RecentDealsTable } from "@/components/closers/RecentDealsTable";
import { CloserStatusBadge } from "@/components/closers/CloserStatusBadge";
import { CloserRoleBadge } from "@/components/closers/CloserRoleBadge";
import type { CloserPublic, DealPublic } from "@/components/closers/types";
import type { CloserDealStats } from "@/lib/deals";

interface CloserDetailData {
  closer: CloserPublic;
  deals: DealPublic[];
  stats: CloserDealStats;
}

export default function CloserDetailPage() {
  const { closerId } = useParams<{ closerId: string }>();

  const { data, isLoading, isError } = useQuery<CloserDetailData>({
    queryKey: ["closer-detail", closerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/closers/${closerId}`);
      if (!res.ok) throw new Error("Failed to fetch closer");
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: !!closerId,
  });

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/closers/manage"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Manage
          </Link>

          {isLoading ? (
            <HeaderSkeleton />
          ) : data ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                {data.closer.avatarPath ? (
                  <img
                    src={data.closer.avatarPath}
                    alt={data.closer.displayName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-bold text-violet-500">
                    {data.closer.displayName
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl lg:text-3xl font-black text-foreground">
                    {data.closer.displayName}
                  </h2>
                  <CloserStatusBadge status={data.closer.status} />
                  <CloserRoleBadge role={data.closer.role} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {data.closer.email}
                </p>
              </div>
              <Link
                href={`/dashboard/closers/${data.closer.id}/dashboard`}
                aria-label={`View ${data.closer.displayName}'s dashboard`}
                className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <Eye className="h-4 w-4" />
                {/* Full label on tablet+, short on phones. */}
                <span className="hidden sm:inline">View their dashboard</span>
                <span className="sm:hidden">View</span>
              </Link>
            </div>
          ) : null}
        </div>

        {/* Error state */}
        {isError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-12 text-center">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Closer not found or failed to load.
            </p>
            <Link
              href="/dashboard/closers/manage"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Manage
            </Link>
          </div>
        )}

        {/* Loading state */}
        {isLoading && <DetailSkeleton />}

        {/* Main content */}
        {data && (
          <>
            <CloserDetailMetrics stats={data.stats} />
            <CloserPerformanceChart deals={data.deals} />
            <RecentDealsTable deals={data.deals} />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 rounded-full animate-pulse bg-muted" />
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metrics skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg animate-pulse bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-6 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted mb-6" />
        <div className="h-[250px] w-full animate-pulse rounded bg-muted" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
        <div className="h-5 w-36 animate-pulse rounded bg-muted mb-6" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((j) => (
            <div key={j} className="h-10 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
