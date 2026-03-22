import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Breadcrumb */}
        <Skeleton className="h-4 w-48" />

        {/* Header */}
        <div>
          <Skeleton className="h-9 w-72 mb-2" />
          <Skeleton className="h-4 w-56" />
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

        {/* Time series chart */}
        <div className="bg-card rounded-2xl p-5 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
          <Skeleton className="h-6 w-48 mb-6 lg:mb-8" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>

        {/* Campaigns table */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden px-4 py-5 lg:px-8 lg:py-6">
          <Skeleton className="h-6 w-28 mb-6" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
