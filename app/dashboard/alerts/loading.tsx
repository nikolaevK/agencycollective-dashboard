import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AlertsLoading() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-7 w-20" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <Skeleton className="h-3 w-14 mb-2 bg-red-500/20" />
            <Skeleton className="h-8 w-10 bg-red-500/20" />
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <Skeleton className="h-3 w-16 mb-2 bg-amber-500/20" />
            <Skeleton className="h-8 w-10 bg-amber-500/20" />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-12 mb-2" />
            <Skeleton className="h-8 w-10" />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-8 w-10" />
          </div>
        </div>

        {/* Alert feed */}
        <div className="rounded-xl border bg-card">
          <div className="p-6 flex items-center justify-between border-b">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-48 rounded-lg" />
          </div>
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-3">
                <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
