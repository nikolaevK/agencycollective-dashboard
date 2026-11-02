import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, TableSkeleton } from "@/components/overview/Skeletons";

export default function AlertsLoading() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-24 rounded-4xl" />
        </div>
        <StatCardsSkeleton count={4} trend={false} className="grid-cols-2 lg:grid-cols-4 xl:grid-cols-4" />
        <TableSkeleton />
      </div>
    </DashboardShell>
  );
}
