import { DashboardShell } from "@/components/layout/DashboardShell";
import { DrilldownHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/overview/Skeletons";

export default function AdSetLoading() {
  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <DrilldownHeaderSkeleton />
        <StatCardsSkeleton count={5} trend={false} />
        <StatCardsSkeleton count={5} trend={false} />
        <TableSkeleton />
      </div>
    </DashboardShell>
  );
}
