import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalOverviewLoading() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Skeleton className="h-7 w-28 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>

        {/* KPI Grid */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-6 border border-border/50">
                <div className="flex justify-between items-start mb-4">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-6 lg:p-5 border border-border/50">
                <div className="flex justify-between items-start mb-4 lg:mb-3">
                  <Skeleton className="h-11 lg:h-10 w-11 lg:w-10 rounded-xl" />
                  <Skeleton className="h-4 w-14 lg:w-12" />
                </div>
                <Skeleton className="h-3 w-24 lg:w-20 mb-2" />
                <Skeleton className="h-8 lg:h-7 w-32 lg:w-24" />
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-xl border bg-card">
          <div className="p-6 border-b">
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="p-6">
            <Skeleton className="h-[320px] w-full rounded-xl" />
          </div>
        </div>

        {/* Top Ads */}
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-5 w-24 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-border/50">
                <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
