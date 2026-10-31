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
import type { ChartDeal, CloserDealStats } from "@/lib/deals";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CloserDetailData {
  closer: CloserPublic;
  deals: DealPublic[];
  /** Uncapped 12-month chart feed; optional so a cached pre-upgrade payload
   *  still renders (chart falls back to the capped deals list). */
  chartDeals?: ChartDeal[];
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
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4 text-muted-foreground">
            <Link href="/dashboard/closers/manage">
              <ArrowLeft />
              Back to Manage
            </Link>
          </Button>

          {isLoading ? (
            <HeaderSkeleton />
          ) : data ? (
            <div className="flex items-center gap-3 sm:gap-4">
              <Avatar className="size-12">
                {data.closer.avatarPath ? (
                  <AvatarImage
                    src={data.closer.avatarPath}
                    alt={data.closer.displayName}
                  />
                ) : (
                  <AvatarFallback className="text-lg font-medium">
                    {data.closer.displayName
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight break-words min-w-0">
                    {data.closer.displayName}
                  </h2>
                  <CloserStatusBadge status={data.closer.status} />
                  <CloserRoleBadge role={data.closer.role} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {data.closer.email}
                </p>
              </div>
              <Button asChild variant="outline" className="shrink-0">
                <Link
                  href={`/dashboard/closers/${data.closer.id}/dashboard`}
                  aria-label={`View ${data.closer.displayName}'s dashboard`}
                >
                  <Eye />
                  {/* Full label on tablet+, short on phones. */}
                  <span className="hidden sm:inline">View their dashboard</span>
                  <span className="sm:hidden">View</span>
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        {/* Error state */}
        {isError && (
          <Card>
            <CardContent className="p-12 md:p-12 text-center">
              <p className="text-sm font-medium text-destructive">
                Closer not found or failed to load.
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-3 text-muted-foreground">
                <Link href="/dashboard/closers/manage">
                  <ArrowLeft />
                  Return to Manage
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {isLoading && <DetailSkeleton />}

        {/* Main content */}
        {data && (
          <>
            <CloserDetailMetrics stats={data.stats} />
            <CloserPerformanceChart deals={data.chartDeals ?? data.deals} />
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
      <Skeleton className="size-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
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
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>

      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((j) => (
            <Skeleton key={j} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
