import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/overview/Skeletons";

export default function PortalOverviewLoading() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>

        {/* KPI cards */}
        <div className="space-y-4">
          <StatCardsSkeleton count={5} />
          <StatCardsSkeleton count={5} />
        </div>

        {/* Chart */}
        <PanelSkeleton height={280} />

        {/* Pixel health & activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PanelSkeleton height={200} />
          <PanelSkeleton height={200} />
        </div>

        {/* Top Ads */}
        <TableSkeleton rows={3} />
      </div>
    </DashboardShell>
  );
}
