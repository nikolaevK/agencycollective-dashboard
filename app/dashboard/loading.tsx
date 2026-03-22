import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="hidden md:block">
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="md:hidden">
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-7 w-40" />
        </div>

        {/* KPI Grid — Primary (5 cards) */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-6 border border-border/50">
                <div className="flex justify-between items-start mb-4">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            ))}
          </div>
          {/* Secondary (4 cards) */}
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

        {/* Middle: Spend chart + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-card rounded-2xl p-5 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
              <Skeleton className="h-6 w-40 mb-6" />
              <Skeleton className="h-[250px] w-full rounded-xl" />
            </div>
          </div>
          <div>
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 dark:border-white/[0.06]">
              <Skeleton className="h-5 w-28 mb-6" />
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-full mb-1.5" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Accounts table */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden px-4 py-5 md:px-8 md:py-6">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
